import { describe, expect, it } from 'vitest';

import {
  ColumnIsNotAnExactIntegerError,
  exactInteger,
  ReferencedRowMissingError,
} from './columns.ts';

describe('exactInteger', () => {
  it('reads a bigint column, which pg hands back as a string', () => {
    expect(exactInteger('total_ttc_cents', '150050')).toBe(150050);
  });

  it('reads an integer column, which pg has already parsed', () => {
    expect(exactInteger('quantity_half_days', 4)).toBe(4);
  });

  it('reads a negative amount, which a credit-note total is', () => {
    expect(exactInteger('total_ht_cents', '-150050')).toBe(-150050);
  });

  it('refuses a decimal string instead of truncating it', () => {
    // `Number.parseInt('150.50', 10)` is 150. A money column that answers with a decimal is a
    // schema fault, and silently dropping the tail is how a wrong amount reaches an invoice.
    expect(() => exactInteger('total_ttc_cents', '150.50')).toThrow(ColumnIsNotAnExactIntegerError);
  });

  it('refuses a value too large to represent exactly', () => {
    const beyondSafe = String(BigInt(Number.MAX_SAFE_INTEGER) + 1n);

    expect(() => exactInteger('total_ttc_cents', beyondSafe)).toThrow(
      ColumnIsNotAnExactIntegerError,
    );
  });

  it('refuses a float that pg parsed for us, so neither branch is trusted', () => {
    expect(() => exactInteger('mentions_recovery_indemnity', 40.5)).toThrow(
      ColumnIsNotAnExactIntegerError,
    );
  });

  it('names the column it refused, so the message points at the schema', () => {
    expect(() => exactInteger('unit_price_cents', 'NaN')).toThrow(/unit_price_cents/);
  });

  it('is not retryable: the same row answers the same way', () => {
    try {
      exactInteger('amount_cents', 'x');
      expect.unreachable();
    } catch (error) {
      expect((error as ColumnIsNotAnExactIntegerError).retryable).toBe(false);
    }
  });
});

describe('ReferencedRowMissingError', () => {
  it('names the table and the id, so the message points at the row to repair', () => {
    const error = new ReferencedRowMissingError('public.legal_entities', 'entity-fr');

    expect(error.message).toContain('public.legal_entities');
    expect(error.message).toContain('entity-fr');
    expect(error.retryable).toBe(false);
  });
});
