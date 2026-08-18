import { InvalidValueError } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { regieLine } from './invoice-line.ts';
import { REGIE_MISSION } from './testing/march-2026.ts';
import type { VatTreatment } from './vat.ts';

const STANDARD: VatTreatment = { kind: 'taxable', basisPoints: 2000 };

function line(overrides: Partial<Parameters<typeof regieLine>[0]> = {}) {
  return regieLine({
    designation: 'Prestation d’audit — mars 2026',
    missionId: REGIE_MISSION,
    craId: 'cra-1',
    period: '2026-03',
    halfDays: 42,
    tjmCents: 65_000,
    vat: STANDARD,
    ...overrides,
  });
}

describe('a line of régie', () => {
  it('is priced by the half-day, so no quantity is ever a decimal', () => {
    // ADR-0012 all the way through: 21 worked days are 42 half-days at 325,00 €, not 21 days at
    // 650,00 € — and a half-day worked alone is 1 × 325,00 €, not a quantity of 0,5.
    const result = line();

    expect(result.quantityHalfDays).toBe(42);
    expect(result.unitPriceCents).toBe(32_500);
    expect(result.amountCents).toBe(1_365_000);
  });

  it('has a unit price and a quantity that multiply back to its amount', () => {
    // The reference test for the first two steps of the order of operations. It holds because a
    // Tjm is an even number of cents, which is the precondition the arithmetic asserts.
    for (const halfDays of [1, 2, 3, 41, 42]) {
      const result = line({ halfDays, tjmCents: 33_300 });

      expect(result.quantityHalfDays * result.unitPriceCents).toBe(result.amountCents);
    }
  });

  it('carries its origin, and the origin names the record it came from', () => {
    const { origin } = line();

    expect(origin.kind).toBe('RegieDays');
    expect(origin.craId).toBe('cra-1');
    expect(origin.missionId).toBe(REGIE_MISSION);
    expect(origin.period).toBe('2026-03');
  });

  it('copies the rate that applied, rather than pointing at the reference', () => {
    // The documentary freeze. February's rate stays on February's line after the renegotiation of
    // 1 March, because the line holds the number and not a lookup.
    const february = line({ period: '2026-02', tjmCents: 62_000, halfDays: 40 });

    expect(february.origin.tjmCents).toBe(62_000);
    expect(february.amountCents).toBe(1_240_000);
  });

  it('freezes the VAT treatment onto itself', () => {
    expect(line().vat).toStrictEqual(STANDARD);
    expect(line({ vat: { kind: 'notCharged', reason: 'reverseChargeEuB2b' } }).vat).toStrictEqual({
      kind: 'notCharged',
      reason: 'reverseChargeEuB2b',
    });
  });

  it('refuses a line with no designation, and a line worth no half-day', () => {
    expect(() => line({ designation: '   ' })).toThrow(InvalidValueError);
    expect(() => line({ halfDays: 0 })).toThrow(InvalidValueError);
  });

  it('refuses a daily rate that is not an even number of cents', () => {
    expect(() => line({ tjmCents: 65_001 })).toThrow(InvalidValueError);
  });
});
