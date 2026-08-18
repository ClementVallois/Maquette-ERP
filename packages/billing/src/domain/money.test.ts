import { InvalidValueError } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import {
  applyRate,
  BASIS_POINTS_DENOMINATOR,
  lineAmountCents,
  roundHalfUp,
  wholePercent,
} from './money.ts';

describe('rounding half-up', () => {
  it('leaves an exact division alone', () => {
    expect(roundHalfUp(1000, 10)).toBe(100);
  });

  it('rounds a half up, never to even', () => {
    // The one case a library default gets differently: `toEven` would answer 2 here and 2 again
    // for 5/2, which is the banker's rounding French invoicing does not use.
    expect(roundHalfUp(5, 2)).toBe(3);
    expect(roundHalfUp(7, 2)).toBe(4);
  });

  it('rounds below a half down', () => {
    expect(roundHalfUp(149, 100)).toBe(1);
    expect(roundHalfUp(150, 100)).toBe(2);
    expect(roundHalfUp(151, 100)).toBe(2);
  });

  it('stays exact at the top of the safe range', () => {
    // The division is by construction on a multiple of the denominator, so it is exact wherever
    // the operands are. This is the last integer where that claim means anything.
    expect(roundHalfUp(Number.MAX_SAFE_INTEGER, 1)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('refuses an operand past the safe range, where arithmetic stops being exact', () => {
    // Beyond 2^53 a double no longer holds every integer, and `+ 1` silently answers itself.
    // Refusing is the only honest answer: this repository claims exact monetary arithmetic.
    expect(() => roundHalfUp(2 ** 53, 1)).toThrow(InvalidValueError);
  });

  it('refuses a negative numerator, because half-up is not symmetric across zero', () => {
    // ADR-0036: an amount is never negative here. A credit note carries positive amounts and the
    // document type carries the direction, which is what keeps this function total.
    expect(() => roundHalfUp(-5, 2)).toThrow(InvalidValueError);
  });

  it('refuses a denominator that is zero or negative', () => {
    expect(() => roundHalfUp(5, 0)).toThrow(InvalidValueError);
    expect(() => roundHalfUp(5, -2)).toThrow(InvalidValueError);
  });

  it('refuses an operand that is not a whole number', () => {
    expect(() => roundHalfUp(5.5, 2)).toThrow(InvalidValueError);
    expect(() => roundHalfUp(5, 2.5)).toThrow(InvalidValueError);
  });
});

describe('a rate in basis points', () => {
  it('names ten thousand as the denominator', () => {
    expect(BASIS_POINTS_DENOMINATOR).toBe(10_000);
    expect(wholePercent(20)).toBe(2000);
  });

  it('applies a whole percentage exactly', () => {
    expect(applyRate(100_000, wholePercent(20))).toBe(20_000);
  });

  it('applies the rate a decimal fraction gets wrong', () => {
    // 8,5 % — Guadeloupe, Martinique, La Réunion (ADR-0010). `100000 * 0.085` is 8500.000000000002
    // in IEEE-754; this is the case ADR-0035 chose basis points for.
    expect(applyRate(100_000, 850)).toBe(8500);
    expect(applyRate(133_333, 850)).toBe(11_333);
  });

  it('rounds the result half-up, once', () => {
    // 1 000 × 8,5 % = 85 exactly; 1 006 × 8,5 % = 85,51 → 86, and 1 005 × 8,5 % = 85,425 → 85.
    expect(applyRate(1000, 850)).toBe(85);
    expect(applyRate(1006, 850)).toBe(86);
    expect(applyRate(1005, 850)).toBe(85);
  });

  it('answers nothing on a rate of zero', () => {
    expect(applyRate(100_000, 0)).toBe(0);
  });

  it('refuses a rate above one hundred percent, and a rate below zero', () => {
    expect(() => applyRate(1000, 10_001)).toThrow(InvalidValueError);
    expect(() => applyRate(1000, -1)).toThrow(InvalidValueError);
    expect(() => wholePercent(101)).toThrow(InvalidValueError);
  });
});

describe('the amount of a line of régie', () => {
  it('is half-days times the daily rate, halved', () => {
    // Ten worked days at 650 € — the shape every line of this mockup has.
    expect(lineAmountCents(20, 65_000)).toBe(650_000);
  });

  it('is exact on an odd count of half-days', () => {
    expect(lineAmountCents(1, 65_000)).toBe(32_500);
    expect(lineAmountCents(21, 65_000)).toBe(682_500);
  });

  it('multiplies first and divides last', () => {
    // The order BUILD-RULES fixes. `halfDays * (tjmCents / 2)` is also exact while the rate is a
    // whole number of euros, and it inverts the safe order: the assertion below is what holds.
    expect(lineAmountCents(3, 33_300)).toBe(49_950);
  });

  it('refuses a daily rate that is not an even number of cents', () => {
    // The precondition of the single division this repository allows. A Tjm of 150,50 € reaches
    // here as 15 050 and would make a half-day 75,25 € — exact — but 15 001 would not.
    expect(() => lineAmountCents(1, 15_001)).toThrow(InvalidValueError);
  });

  it('refuses a count of half-days that is not a whole number', () => {
    expect(() => lineAmountCents(1.5, 65_000)).toThrow(InvalidValueError);
  });

  it('refuses a negative count of half-days, and a negative daily rate', () => {
    // Neither can arrive from the event or from the reference data, and both are guards rather
    // than checks for that reason: an amount is never negative in this domain (ADR-0036), and a
    // line that quietly billed −650 € would be the correction nobody asked for.
    expect(() => lineAmountCents(-2, 65_000)).toThrow(InvalidValueError);
    expect(() => lineAmountCents(2, -65_000)).toThrow(InvalidValueError);
  });

  it('bills nothing for no half-day', () => {
    expect(lineAmountCents(0, 65_000)).toBe(0);
  });
});
