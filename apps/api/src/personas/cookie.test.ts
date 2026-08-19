import { describe, expect, it } from 'vitest';

import type { ApiConfig } from '../config.ts';

import {
  clearedPersonaCookie,
  PERSONA_COOKIE,
  personaCookie,
  readCookie,
  signPersonaKey,
  unsignPersonaKey,
} from './cookie.ts';

const SECRET = 'a-signing-key-long-enough-to-be-one';
const OTHER_SECRET = 'a-different-signing-key-of-the-same-kind';

const config = (publicOrigin: string): ApiConfig => ({
  databaseUrl: 'postgres://erp_app:pw@localhost:5433/erp',
  host: '127.0.0.1',
  port: 3000,
  publicOrigin,
  sessionSigningKey: SECRET,
  logLevel: 'silent',
});

describe('signing and unsigning', () => {
  it('round-trips a key', () => {
    const signed = `manager-lyon.${signPersonaKey('manager-lyon', SECRET)}`;

    expect(unsignPersonaKey(signed, SECRET)).toBe('manager-lyon');
  });

  it('refuses a key whose signature was made with another secret', () => {
    const signed = `manager-lyon.${signPersonaKey('manager-lyon', OTHER_SECRET)}`;

    expect(unsignPersonaKey(signed, SECRET)).toBeNull();
  });

  it('refuses a key swapped under a valid signature', () => {
    // The attack the signature exists to stop: keep a signature that verified and change the
    // persona it was issued for.
    const signature = signPersonaKey('consultant-paris', SECRET);

    expect(unsignPersonaKey(`billing-paris.${signature}`, SECRET)).toBeNull();
  });

  it('refuses a cookie with no signature, an empty one, or nothing but one', () => {
    for (const hostile of ['manager-lyon', 'manager-lyon.', '.abc', '', '.']) {
      expect(unsignPersonaKey(hostile, SECRET)).toBeNull();
    }
  });

  it('refuses a signature of the wrong length rather than throwing', () => {
    // `timingSafeEqual` throws on a length mismatch. Without the length check this is a 500 on a
    // request anyone can send, which is a denial of service with one byte.
    expect(() => unsignPersonaKey('manager-lyon.short', SECRET)).not.toThrow();
    expect(unsignPersonaKey('manager-lyon.short', SECRET)).toBeNull();
  });

  it('keeps a key that itself contains a dot', () => {
    // The split is on the LAST dot, so a key is not silently truncated by one.
    const key = 'manager.lyon';
    expect(unsignPersonaKey(`${key}.${signPersonaKey(key, SECRET)}`, SECRET)).toBe(key);
  });

  it('produces a url-safe signature', () => {
    for (const key of ['a', 'consultant-paris', 'manager-lyon', 'billing-paris', 'x'.repeat(64)]) {
      expect(signPersonaKey(key, SECRET)).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});

describe('the Set-Cookie header', () => {
  it('is HttpOnly, SameSite=Strict and scoped to the whole site', () => {
    const header = personaCookie('manager-lyon', config('http://localhost:3000'));

    expect(header).toContain(`${PERSONA_COOKIE}=manager-lyon.`);
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Strict');
    expect(header).toContain('Path=/');
  });

  it('adds Secure over https and omits it over http', () => {
    // Hardcoded either way is wrong: always, and no browser keeps it locally; never, and the
    // deployed instance sends it in the clear.
    expect(personaCookie('x', config('https://erp.example.test'))).toContain('Secure');
    expect(personaCookie('x', config('http://localhost:3000'))).not.toContain('Secure');
  });

  it('clears with Max-Age=0 and only that', () => {
    const header = clearedPersonaCookie(config('http://localhost:3000'));

    expect(header).toContain('Max-Age=0');
    expect(header).toContain('HttpOnly');
    expect(header.match(/Max-Age/gu)).toHaveLength(1);
  });
});

describe('readCookie', () => {
  it('finds the cookie among others', () => {
    expect(readCookie(`a=1; ${PERSONA_COOKIE}=key.sig; z=9`, PERSONA_COOKIE)).toBe('key.sig');
  });

  it('keeps a value containing =', () => {
    expect(readCookie(`${PERSONA_COOKIE}=a=b=c`, PERSONA_COOKIE)).toBe('a=b=c');
  });

  it('answers null for an absent header, an absent cookie and an empty value', () => {
    expect(readCookie(undefined, PERSONA_COOKIE)).toBeNull();
    expect(readCookie('a=1; b=2', PERSONA_COOKIE)).toBeNull();
    expect(readCookie(`${PERSONA_COOKIE}=`, PERSONA_COOKIE)).toBeNull();
  });

  it('does not match a cookie whose name merely ends with the one asked for', () => {
    expect(readCookie(`not_${PERSONA_COOKIE}=value`, PERSONA_COOKIE)).toBeNull();
  });
});
