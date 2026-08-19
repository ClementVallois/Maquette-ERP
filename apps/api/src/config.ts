import { TechnicalFailure } from '@erp/platform';
import { z } from 'zod';

/**
 * Configuration is read once, at startup, and the process refuses to run without it.
 *
 * The refusal names the variable and what it expects; it never names the value. `DATABASE_URL`
 * carries a password and `SESSION_SIGNING_KEY` is a key — echoing either back into a message
 * puts it in a terminal, a log aggregator and a crash report at once. That is why the expectation
 * text below is hand-written per variable rather than taken from the validator: a library's
 * message is free to quote what it received, and this one cannot.
 */

export class ConfigurationError extends TechnicalFailure {
  readonly retryable = false;
}

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface ApiConfig {
  /** The least-privilege application role. The schema owner's credential is never given to the API. */
  readonly databaseUrl: string;
  readonly host: string;
  readonly port: number;
  /** Scheme and authority, no path — what a state-changing request's `Origin` must equal. */
  readonly publicOrigin: string;
  readonly sessionSigningKey: string;
  readonly logLevel: LogLevel;
}

/** The minimum an HMAC key may be, in characters. 32 hex characters is 128 bits of material. */
const MIN_SIGNING_KEY_LENGTH = 32;

const MIN_PORT = 1;
const MAX_PORT = 65535;
const DEFAULT_PORT = 3000;

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  API_HOST: z.string().min(1).default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(MIN_PORT).max(MAX_PORT).default(DEFAULT_PORT),
  API_PUBLIC_ORIGIN: z.string().regex(/^https?:\/\/[^/\s]+$/),
  SESSION_SIGNING_KEY: z.string().min(MIN_SIGNING_KEY_LENGTH),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

const EXPECTED: Readonly<Record<string, string>> = {
  DATABASE_URL: 'a Postgres connection string for the application role — see .env.example',
  API_HOST: 'an interface to bind — 127.0.0.1 locally, 0.0.0.0 in a container',
  API_PORT: `an integer between ${String(MIN_PORT)} and ${String(MAX_PORT)}`,
  API_PUBLIC_ORIGIN:
    'the origin this instance is reached at, scheme and host only, no trailing slash — for example http://localhost:3000',
  SESSION_SIGNING_KEY: `at least ${String(MIN_SIGNING_KEY_LENGTH)} characters of key material — it signs the persona cookie`,
  LOG_LEVEL: `one of ${LOG_LEVELS.join(', ')}`,
};

/**
 * Takes the environment rather than reading `process.env`, so a test configures a case instead of
 * mutating the process it runs in.
 */
export function loadConfig(env: Record<string, string | undefined>): ApiConfig {
  const parsed = schema.safeParse(env);

  if (!parsed.success) {
    const named = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].sort();

    throw new ConfigurationError(
      'Configuration refused at startup. Set these environment variables and start again:\n' +
        named.map((name) => `  ${name} — ${EXPECTED[name] ?? 'see .env.example'}`).join('\n'),
    );
  }

  return {
    databaseUrl: parsed.data.DATABASE_URL,
    host: parsed.data.API_HOST,
    port: parsed.data.API_PORT,
    publicOrigin: parsed.data.API_PUBLIC_ORIGIN,
    sessionSigningKey: parsed.data.SESSION_SIGNING_KEY,
    logLevel: parsed.data.LOG_LEVEL,
  };
}
