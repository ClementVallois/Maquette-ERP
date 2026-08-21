/**
 * UUIDv7 generator (RFC 9562). Two modes:
 *
 * - `uuidv7()` — wall-clock timestamp, random suffix. For runtime use in repositories.
 * - `uuidv7Deterministic(timestampMs, counter)` — frozen timestamp, counter-based suffix.
 *   For the seed (ADR-0022): same inputs, same output, every run.
 *
 * Hand-written rather than imported: Node 24's `crypto.randomUUID()` is v4 only, and the
 * layout is 22 lines of bit-packing — simpler than evaluating a library (ADR-0041).
 *
 * It lives here because ADR-0041 said it would: "the repositories import from `scripts/lib/` at
 * seed time … or, once `apps/api/` exists (Phase 5), from the composition root". `@erp/platform`
 * is not an option — it imports not even a Node builtin, and `randomBytes` is one — and the two
 * composition roots that mint ids, the runtime one here and the deterministic one in the seed,
 * must mint them the same way or the seed stops proving anything about the running system.
 *
 * The modules themselves never import it: the dependency rule grants them `@erp/platform` and
 * nothing else, so a repository that needs an id is **given a factory**, which is what keeps the
 * choice of generator on this side of the boundary.
 */

import { randomBytes } from 'node:crypto';

const HEX = '0123456789abcdef';

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += HEX.charAt(byte >> 4) + HEX.charAt(byte & 0x0f);
  }
  return out;
}

function formatUuid(hex: string): string {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Build a UUIDv7 from a 48-bit timestamp and 10 bytes of suffix material.
 *
 * Layout (RFC 9562 § 5.7):
 *   bits  0–47:  unix_ts_ms (48 bits)
 *   bits 48–51:  version = 0b0111 (4 bits)
 *   bits 52–63:  rand_a (12 bits)
 *   bits 64–65:  variant = 0b10 (2 bits)
 *   bits 66–127: rand_b (62 bits)
 */
function pack(timestampMs: number, suffix: Uint8Array): string {
  const bytes = new Uint8Array(16);

  // 48-bit big-endian timestamp
  bytes[0] = (timestampMs / 0x10000000000) & 0xff;
  bytes[1] = (timestampMs / 0x100000000) & 0xff;
  bytes[2] = (timestampMs / 0x1000000) & 0xff;
  bytes[3] = (timestampMs / 0x10000) & 0xff;
  bytes[4] = (timestampMs / 0x100) & 0xff;
  bytes[5] = timestampMs & 0xff;

  // Copy suffix into bytes 6–15
  bytes.set(suffix.subarray(0, 10), 6);

  // Version: bits 48–51 = 0111 (byte 6 exists — the array is 16 wide)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;

  // Variant: bits 64–65 = 10
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  return formatUuid(toHex(bytes));
}

/** Runtime UUIDv7: wall-clock timestamp, cryptographically random suffix. */
export function uuidv7(): string {
  return pack(Date.now(), randomBytes(10));
}

/** Deterministic UUIDv7: frozen timestamp, counter-based suffix. Same inputs → same output. */
export function uuidv7Deterministic(timestampMs: number, counter: number): string {
  const suffix = new Uint8Array(10);
  // These eight assignments do **not** write a 64-bit counter, whatever they look like. A JS
  // bitwise shift coerces to int32 and takes its count mod 32, so `counter >> 56` evaluates as
  // `counter >> 24`: `suffix[2..5]` and `suffix[6..9]` receive the same four bytes, and only the
  // low 32 bits of the counter reach the id at all.
  //
  // The consequence is the real limit: two counters that agree modulo 2**32 produce the **same**
  // id. Nothing here approaches it — the seed's counters reach about 2040 — and the duplicated
  // bytes cost nothing, so the code stands as written; the arithmetic is what needed saying.
  // `suffix[0]` and `suffix[1]` are left at zero, which is free: the version and variant nibbles
  // overwrite bytes 0 and 2 of the suffix anyway.
  suffix[2] = (counter >> 56) & 0xff;
  suffix[3] = (counter >> 48) & 0xff;
  suffix[4] = (counter >> 40) & 0xff;
  suffix[5] = (counter >> 32) & 0xff;
  suffix[6] = (counter >> 24) & 0xff;
  suffix[7] = (counter >> 16) & 0xff;
  suffix[8] = (counter >> 8) & 0xff;
  suffix[9] = counter & 0xff;

  return pack(timestampMs, suffix);
}

/**
 * A factory that mints deterministic UUIDv7s from a shared timestamp and an auto-incrementing
 * counter. Every call to `next()` returns a new, unique, deterministic id.
 */
export function deterministicIdFactory(timestampMs: number): { next(): string } {
  let counter = 0;
  return {
    next() {
      return uuidv7Deterministic(timestampMs, counter++);
    },
  };
}
