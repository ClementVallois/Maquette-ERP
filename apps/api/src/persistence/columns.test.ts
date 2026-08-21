import { describe, expect, it } from 'vitest';

import { ApiFailure } from '../errors.ts';

import { exactCents } from './columns.ts';

/**
 * The negative half of the reasoning `billing/src/infrastructure/columns.ts` carries a copy of.
 * The doc comment was duplicated when this file was written; `columns.test.ts` next to it was
 * not, which left the only decoder between a `numeric`/`bigint` column and `cjmCents`/`tjmCents`
 * in the API tier with three throw branches and nothing reaching any of them.
 */

describe('exactCents', () => {
  it('reads a bigint column, which pg hands back as a string', () => {
    expect(exactCents('cjm_cents', '25000')).toBe(25_000);
  });

  it('reads an integer column, which pg has already parsed', () => {
    expect(exactCents('half_days', 42)).toBe(42);
  });

  it('reads a negative amount, which a margin can be', () => {
    expect(exactCents('margin_cents', '-125000')).toBe(-125_000);
  });

  it('refuses a decimal string instead of truncating it', () => {
    // `Number.parseInt('250.50', 10)` is 250. A money column that answers with a decimal is a
    // schema fault, and dropping the tail silently is how a wrong amount reaches a margin.
    expect(() => exactCents('cjm_cents', '250.50')).toThrow(ApiFailure);
  });

  it('refuses a string that is not a number at all', () => {
    expect(() => exactCents('tjm_cents', 'NaN')).toThrow(ApiFailure);
  });

  it('refuses a value past the safe integer range, where the answer would not be the stored one', () => {
    const beyondSafe = String(BigInt(Number.MAX_SAFE_INTEGER) + 1n);

    expect(() => exactCents('tjm_cents', beyondSafe)).toThrow(ApiFailure);
  });

  it('refuses a float pg parsed for us, so neither branch is trusted', () => {
    expect(() => exactCents('cjm_cents', 250.5)).toThrow(ApiFailure);
  });

  it('names the column it refused, so the message points at the schema', () => {
    expect(() => exactCents('cjm_cents', '250.50')).toThrow(/cjm_cents/u);
  });

  it('is not retryable: the same row answers the same way', () => {
    try {
      exactCents('cjm_cents', 'x');
      expect.unreachable();
    } catch (error) {
      expect((error as ApiFailure).retryable).toBe(false);
    }
  });
});
