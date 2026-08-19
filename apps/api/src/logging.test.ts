import { BusinessError, TechnicalFailure } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import {
  loggerOptions,
  serializeError,
  serializeReply,
  serializeRequest,
  splitUrl,
} from './logging.ts';

class Refused extends BusinessError {
  readonly problemType = '/problems/refused';
}

class Broke extends TechnicalFailure {
  readonly retryable = true;
}

describe('splitUrl', () => {
  it('keeps a path without a query string as it is', () => {
    expect(splitUrl('/api/v1/cras')).toStrictEqual({ path: '/api/v1/cras', queryKeys: [] });
  });

  it('keeps the names of query parameters and drops every value', () => {
    const { path, queryKeys } = splitUrl('/api/v1/cras?period=2026-06&persona=manager-lyon');

    expect(path).toBe('/api/v1/cras');
    expect(queryKeys).toStrictEqual(['period', 'persona']);
  });

  it('drops a repeated parameter to one name', () => {
    expect(splitUrl('/x?a=1&a=2').queryKeys).toStrictEqual(['a']);
  });
});

describe('serializeRequest', () => {
  const request = { id: 'corr-1', method: 'GET', url: '/api/v1/cras?token=hunter2' };

  it('emits only id, method, path and query names', () => {
    expect(serializeRequest(request)).toStrictEqual({
      id: 'corr-1',
      method: 'GET',
      path: '/api/v1/cras',
      queryKeys: ['token'],
    });
  });

  it('never emits a query value', () => {
    expect(JSON.stringify(serializeRequest(request))).not.toContain('hunter2');
  });

  it('cannot emit a header, because it never reads one', () => {
    // The allowlist property, asserted rather than described: a `cookie` header carrying the
    // signed persona is on the request object and contributes nothing to the log line.
    const withHeaders = { ...request, headers: { cookie: 'erp_persona=manager-lyon.SIGNATURE' } };

    expect(JSON.stringify(serializeRequest(withHeaders))).not.toContain('SIGNATURE');
  });
});

describe('serializeReply', () => {
  it('emits the status code and nothing else', () => {
    expect(serializeReply({ statusCode: 403 })).toStrictEqual({ statusCode: 403 });
  });

  it('does not emit response headers, which carry Set-Cookie', () => {
    const reply = { statusCode: 200, headers: { 'set-cookie': 'erp_persona=x.SIGNATURE' } };

    expect(JSON.stringify(serializeReply(reply))).not.toContain('SIGNATURE');
  });
});

describe('serializeError', () => {
  it('carries the problem type and the business fields of a business refusal', () => {
    const serialized = serializeError(
      new Refused('the manager of March validates March', {
        craId: 'cra-1',
      }),
    );

    expect(serialized['type']).toBe('Refused');
    expect(serialized['problemType']).toBe('/problems/refused');
    expect(serialized['details']).toStrictEqual({ craId: 'cra-1' });
  });

  it('carries retryability for a technical failure', () => {
    expect(serializeError(new Broke('connection reset'))['retryable']).toBe(true);
  });

  it('never emits `cause`, which is where a driver puts the connection it failed on', () => {
    const cause = new Error('connect ECONNREFUSED');
    Object.assign(cause, { password: 'erp_local_dev', connectionString: 'postgres://u:p@h/d' });
    const serialized = serializeError(new Broke('database unreachable', { cause }));

    expect(serialized['cause']).toBeUndefined();
    expect(JSON.stringify(serialized)).not.toContain('erp_local_dev');
    expect(JSON.stringify(serialized)).not.toContain('postgres://');
  });

  it('does not publish the details of something that is not a business error', () => {
    const technical = new Broke('failed');
    Object.assign(technical, { details: { password: 'hunter2' } });

    expect(JSON.stringify(serializeError(technical))).not.toContain('hunter2');
  });

  it('says what it got when it is handed something that is not an error at all', () => {
    expect(serializeError('a string')).toStrictEqual({ type: 'string' });
    expect(serializeError(null)).toStrictEqual({ type: 'object' });
  });
});

describe('loggerOptions', () => {
  const config = {
    databaseUrl: 'postgres://erp_app:hunter2@localhost:5433/erp',
    host: '127.0.0.1',
    port: 3000,
    publicOrigin: 'http://localhost:3000',
    sessionSigningKey: 'k'.repeat(40),
    logLevel: 'warn' as const,
  };

  it('takes its level from the configuration', () => {
    expect(loggerOptions(config).level).toBe('warn');
  });

  it('puts no part of the configuration into every log line', () => {
    // `base` is stamped on every record. A configuration object spread into it would put the
    // database password on every line ever written.
    expect(JSON.stringify(loggerOptions(config).base)).not.toContain('hunter2');
  });

  it("installs the allowlisting serialisers, replacing pino's defaults", () => {
    const { serializers } = loggerOptions(config);

    expect(serializers?.['req']).toBe(serializeRequest);
    expect(serializers?.['res']).toBe(serializeReply);
    expect(serializers?.['err']).toBe(serializeError);
  });
});
