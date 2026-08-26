import { describe, expect, it } from 'vitest';

import { BusinessError, InvalidValueError, isBusinessError, TechnicalFailure } from './errors.ts';

class RuleRefused extends BusinessError {
  readonly problemType = '/problems/rule-refused';
}

class ConnectionLost extends TechnicalFailure {
  readonly retryable = true;
}

describe('a refused value', () => {
  it('says what it saw, including when what it saw is an object', () => {
    // `String({})` is `[object Object]`, and the dated timeline refuses objects. The message is
    // the half a human reads; `details.value` is the half the wire reads.
    expect(
      new InvalidValueError('timeline.entry', { from: '2026-06-01' }, 'a period').message,
    ).toBe('timeline.entry must be a period, got {"from":"2026-06-01"}');
    expect(new InvalidValueError('date', '2026-02-30', 'a real day').message).toBe(
      'date must be a real day, got "2026-02-30"',
    );
    expect(new InvalidValueError('quarterDays', Number.NaN, 'a whole number').message).toBe(
      'quarterDays must be a whole number, got NaN',
    );
  });

  it('gives up on an unprintable value rather than throwing while refusing one', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;

    expect(new InvalidValueError('x', cyclic, 'anything').message).toContain('[unprintable]');
  });
});

describe('typed errors', () => {
  it('carries the problem type and the business fields of the refusal', () => {
    const error = new RuleRefused('the rule refused', { craId: 'c-1', recorded: 42 });

    expect(error.problemType).toBe('/problems/rule-refused');
    expect(error.details).toStrictEqual({ craId: 'c-1', recorded: 42 });
    expect(error.message).toBe('the rule refused');
  });

  it('reports the name of the subclass, not of the base class', () => {
    // A log line saying `Error` for every refusal is the failure this line exists to prevent.
    expect(new RuleRefused('x').name).toBe('RuleRefused');
    expect(new ConnectionLost('y').name).toBe('ConnectionLost');
  });

  it('defaults to no details rather than to undefined', () => {
    expect(new RuleRefused('x').details).toStrictEqual({});
  });

  it('keeps the cause of a technical failure', () => {
    const cause = new RuleRefused('underneath');

    expect(new ConnectionLost('lost', { cause }).cause).toBe(cause);
  });

  it('tells a business refusal apart from anything else', () => {
    expect(isBusinessError(new RuleRefused('x'))).toBe(true);
    // The negative side: a technical failure must NOT reach the wire as a business refusal, or a
    // dropped connection is published to the client as a violated invariant.
    expect(isBusinessError(new ConnectionLost('y'))).toBe(false);
    expect(isBusinessError(new TypeError('z'))).toBe(false);
    expect(isBusinessError('not an error at all')).toBe(false);
  });
});
