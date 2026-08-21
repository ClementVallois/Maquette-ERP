import { describe, expect, it } from 'vitest';

import { ConfigurationError, loadConfig } from './config.ts';

const PASSWORD = 'sup3rs3cr3t-database-password';
const SIGNING_KEY = 'a'.repeat(40);

const complete = {
  DATABASE_URL: `postgres://erp_app:${PASSWORD}@localhost:5433/erp`,
  API_HOST: '0.0.0.0',
  API_PORT: '8080',
  API_PUBLIC_ORIGIN: 'https://erp.example.test',
  SESSION_SIGNING_KEY: SIGNING_KEY,
  LOG_LEVEL: 'debug',
};

describe('loadConfig', () => {
  it('reads a complete environment', () => {
    expect(loadConfig(complete)).toStrictEqual({
      databaseUrl: `postgres://erp_app:${PASSWORD}@localhost:5433/erp`,
      host: '0.0.0.0',
      port: 8080,
      publicOrigin: 'https://erp.example.test',
      sessionSigningKey: SIGNING_KEY,
      logLevel: 'debug',
    });
  });

  it('defaults the three variables that have a safe default', () => {
    const config = loadConfig({
      DATABASE_URL: complete.DATABASE_URL,
      API_PUBLIC_ORIGIN: complete.API_PUBLIC_ORIGIN,
      SESSION_SIGNING_KEY: SIGNING_KEY,
    });

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3000);
    expect(config.logLevel).toBe('info');
  });

  it('names every missing variable at once, not the first one', () => {
    expect(() => loadConfig({})).toThrow(ConfigurationError);

    try {
      loadConfig({});
      expect.unreachable('an empty environment must be refused');
    } catch (error) {
      const { message } = error as Error;
      expect(message).toContain('DATABASE_URL');
      expect(message).toContain('API_PUBLIC_ORIGIN');
      expect(message).toContain('SESSION_SIGNING_KEY');
      // Naming the variable is half of it; the other half is saying what to do about it.
      expect(message).toContain('it signs the persona cookie');
    }
  });

  it('refuses a signing key too short to be one', () => {
    expect(() => loadConfig({ ...complete, SESSION_SIGNING_KEY: 'short' })).toThrow(
      /SESSION_SIGNING_KEY/,
    );
  });

  it('refuses an origin carrying a path, because the CSRF check compares it literally', () => {
    expect(() =>
      loadConfig({ ...complete, API_PUBLIC_ORIGIN: 'https://erp.example.test/app' }),
    ).toThrow(/API_PUBLIC_ORIGIN/);
  });

  it('refuses a port that is not a port', () => {
    expect(() => loadConfig({ ...complete, API_PORT: '70000' })).toThrow(/API_PORT/);
    expect(() => loadConfig({ ...complete, API_PORT: 'nope' })).toThrow(/API_PORT/);
  });

  it('never puts a rejected secret in the message it prints', () => {
    // The negative test BUILD-RULES § "No secret in a log, an error response or a stack trace"
    // exists for. A validator quoting what it received would fail here, which is why the
    // expectation text is hand-written rather than taken from the validator.
    try {
      loadConfig({
        ...complete,
        API_PORT: 'nope',
        SESSION_SIGNING_KEY: 'too-short-but-still-a-key',
        DATABASE_URL: '',
      });
      expect.unreachable('a broken environment must be refused');
    } catch (error) {
      const { message, stack } = error as Error;
      expect(message).not.toContain('too-short-but-still-a-key');
      expect(message).not.toContain(PASSWORD);
      expect(stack ?? '').not.toContain('too-short-but-still-a-key');
    }
  });

  it('is a technical failure that retrying will not fix', () => {
    try {
      loadConfig({});
      expect.unreachable('an empty environment must be refused');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as ConfigurationError).retryable).toBe(false);
      expect((error as ConfigurationError).name).toBe('ConfigurationError');
    }
  });
});
