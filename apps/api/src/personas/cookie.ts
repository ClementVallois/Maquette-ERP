import { createHmac, timingSafeEqual } from 'node:crypto';

import type { ApiConfig } from '../config.ts';

/**
 * The persona cookie (ADR-0023): `erp_persona=<key>.<base64url HMAC-SHA-256(key)>`.
 *
 * Hand-written rather than `@fastify/cookie`, for the reason ADR-0041 gives for the UUID
 * generator and ADR-0025 gives for the template engine: what is needed is one HMAC, one
 * constant-time comparison and one `Set-Cookie` string.
 *
 * Signed rather than plain, because an unsigned cookie makes the persona a client-supplied
 * string — the selector would then be the client *asserting* an identity, and every authorization
 * test in the repository would still pass.
 */

export const PERSONA_COOKIE = 'erp_persona';

/** A week. The instance resets nightly (ADR-0032), so this outlives nothing that matters. */
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function signPersonaKey(key: string, secret: string): string {
  return createHmac('sha256', secret).update(key).digest('base64url');
}

/**
 * The signed value, or `null`. `null` covers every failure the same way on purpose — a wrong
 * signature and a malformed cookie are the same event to a caller, and distinguishing them in the
 * answer would say which half they got right.
 */
export function unsignPersonaKey(value: string, secret: string): string | null {
  const separator = value.lastIndexOf('.');
  if (separator <= 0 || separator === value.length - 1) return null;

  const key = value.slice(0, separator);
  const presented = Buffer.from(value.slice(separator + 1));
  const expected = Buffer.from(signPersonaKey(key, secret));

  // `timingSafeEqual` throws on a length mismatch, so the lengths are compared first. That
  // comparison leaks the length of a base64url SHA-256 digest, which is a constant.
  if (presented.length !== expected.length) return null;

  return timingSafeEqual(presented, expected) ? key : null;
}

/**
 * `Secure` follows the configured origin rather than being hardcoded: set unconditionally, no
 * browser would keep the cookie over plain HTTP and the selector would silently never persist
 * locally; omitted unconditionally, the deployed instance would send it over the network in the
 * clear.
 */
function attributes(config: ApiConfig): string[] {
  const flags = ['Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${String(MAX_AGE_SECONDS)}`];
  if (config.publicOrigin.startsWith('https://')) flags.push('Secure');

  return flags;
}

export function personaCookie(key: string, config: ApiConfig): string {
  const value = `${key}.${signPersonaKey(key, config.sessionSigningKey)}`;

  return [`${PERSONA_COOKIE}=${value}`, ...attributes(config)].join('; ');
}

export function clearedPersonaCookie(config: ApiConfig): string {
  return [
    `${PERSONA_COOKIE}=`,
    ...attributes(config).filter((flag) => !flag.startsWith('Max-Age')),
    'Max-Age=0',
  ].join('; ');
}

/**
 * One cookie out of a `Cookie` header. Written rather than imported for the same reason as the
 * signing above; the header is a `; `-separated list of `name=value`, and a value may itself
 * contain `=`.
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (header === undefined) return null;

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() !== name) continue;

    const value = pair.slice(separator + 1).trim();

    return value === '' ? null : value;
  }

  return null;
}
