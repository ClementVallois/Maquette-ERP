import { isBusinessError, TechnicalFailure } from '@erp/platform';
import type { LoggerOptions } from 'pino';
import pino from 'pino';

import type { ApiConfig } from './config.ts';

/**
 * Structured logging, redacted by **allowlist in the serialiser** (ADR-0024).
 *
 * Every serialiser here builds a fresh object out of named fields. Nothing is copied wholesale
 * and then subtracted, so a header, a body field or a query value added tomorrow is absent from
 * the log by default rather than present until somebody remembers to remove it.
 */

/** What a request may contribute to a log line. Anything not listed does not reach the log. */
interface LoggableRequest {
  readonly method: string;
  readonly url: string;
  readonly id: string;
}

interface LoggableReply {
  readonly statusCode: number;
}

/**
 * The query string is dropped and only the **names** of its parameters are kept. A value in a URL
 * ends up in an access log, a referrer header and a proxy cache; the names are enough to read a
 * trace, and this is the same reasoning that puts the persona in a cookie rather than in a query
 * parameter (ADR-0023).
 */
export function splitUrl(url: string): { path: string; queryKeys: string[] } {
  const separator = url.indexOf('?');
  if (separator < 0) return { path: url, queryKeys: [] };

  const path = url.slice(0, separator);
  const keys = [...new URLSearchParams(url.slice(separator + 1)).keys()].sort();

  return { path, queryKeys: [...new Set(keys)] };
}

export function serializeRequest(request: LoggableRequest): Record<string, unknown> {
  const { path, queryKeys } = splitUrl(request.url);

  return { id: request.id, method: request.method, path, queryKeys };
}

export function serializeReply(reply: LoggableReply): Record<string, unknown> {
  return { statusCode: reply.statusCode };
}

/**
 * `cause` is deliberately absent. A `pg` error carries the failing query and, on a connection
 * failure, the connection options — which hold the password. `details` is present only for a
 * `BusinessError`, whose details are business fields by construction (ADR-0016); a technical
 * failure has no such guarantee and contributes nothing but its class and its message.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) return { type: typeof error };

  const serialized: Record<string, unknown> = {
    type: error.name,
    message: error.message,
    stack: error.stack,
  };

  if (isBusinessError(error)) {
    serialized['problemType'] = error.problemType;
    serialized['details'] = error.details;
  }

  if (error instanceof TechnicalFailure) {
    serialized['retryable'] = error.retryable;
  }

  return serialized;
}

export function loggerOptions(config: ApiConfig): LoggerOptions {
  return {
    level: config.logLevel,
    base: { service: 'erp-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    serializers: {
      req: serializeRequest,
      res: serializeReply,
      err: serializeError,
      error: serializeError,
    },
  };
}
