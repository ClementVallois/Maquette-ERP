import { describe, expect, it } from 'vitest';

import { deterministicIdFactory, uuidv7, uuidv7Deterministic } from './uuidv7.ts';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** RFC 9562 § 5.7: version nibble is `7`, variant bits are `10` — so `8`, `9`, `a` or `b`. */
function isUuidV7(candidate: string): boolean {
  return (
    UUID_SHAPE.test(candidate) && candidate[14] === '7' && '89ab'.includes(candidate[19] ?? '')
  );
}

/** The 48-bit big-endian timestamp is the first twelve hex characters. */
function timestampOf(uuid: string): number {
  return Number.parseInt(uuid.slice(0, 8) + uuid.slice(9, 13), 16);
}

const INSTANT = Date.UTC(2026, 5, 15);

describe('uuidv7Deterministic', () => {
  it('produces a valid UUIDv7', () => {
    expect(isUuidV7(uuidv7Deterministic(INSTANT, 0))).toBe(true);
  });

  it('carries the timestamp it was given, not the one it ran at', () => {
    expect(timestampOf(uuidv7Deterministic(INSTANT, 41))).toBe(INSTANT);
  });

  it('answers the same value for the same inputs — the property the seed rests on', () => {
    expect(uuidv7Deterministic(INSTANT, 7)).toBe(uuidv7Deterministic(INSTANT, 7));
  });

  it('repeats itself once the counter passes 2**32, the real limit of this generator', () => {
    // Not a defect: the shifts above are mod 32, so only the low 32 bits of the counter reach the
    // id. It is pinned here because the comment in the source used to claim a 64-bit counter, and
    // a claim nothing tests is how the next reader budgets for a range that does not exist. The
    // seed's counters reach about 2040.
    expect(uuidv7Deterministic(INSTANT, 1)).toBe(uuidv7Deterministic(INSTANT, 2 ** 32 + 1));
  });

  it('answers a different value for a different counter', () => {
    expect(uuidv7Deterministic(INSTANT, 7)).not.toBe(uuidv7Deterministic(INSTANT, 8));
  });

  it('keeps the version and variant bits over the whole counter range it can be given', () => {
    // The counter is written across the suffix bytes that the version and variant nibbles also
    // occupy. A counter large enough to reach byte 2 of the suffix is what would break them.
    for (const counter of [0, 1, 255, 256, 65535, 16777215, 0xffffffff]) {
      expect(isUuidV7(uuidv7Deterministic(INSTANT, counter))).toBe(true);
    }
  });
});

describe('deterministicIdFactory', () => {
  it('mints a fresh id on every call', () => {
    const factory = deterministicIdFactory(INSTANT);
    const minted = [factory.next(), factory.next(), factory.next()];

    expect(new Set(minted).size).toBe(3);
  });

  it('replays identically from a fresh factory on the same instant', () => {
    const first = deterministicIdFactory(INSTANT);
    const second = deterministicIdFactory(INSTANT);

    expect([first.next(), first.next()]).toStrictEqual([second.next(), second.next()]);
  });

  it('sorts in minting order, which is what UUIDv7 is chosen for', () => {
    const factory = deterministicIdFactory(INSTANT);
    const minted = [factory.next(), factory.next(), factory.next()];

    expect([...minted].sort()).toStrictEqual(minted);
  });
});

describe('uuidv7', () => {
  it('produces a valid UUIDv7 from the wall clock', () => {
    expect(isUuidV7(uuidv7())).toBe(true);
  });

  it('does not repeat itself', () => {
    const minted = Array.from({ length: 500 }, () => uuidv7());

    expect(new Set(minted).size).toBe(500);
  });
});
