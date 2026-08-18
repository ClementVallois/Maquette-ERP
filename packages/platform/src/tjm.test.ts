import { describe, expect, it } from 'vitest';

import { InvalidValueError } from './errors.ts';
import { CENTS_PER_EURO, tjmCentsFromEuros } from './tjm.ts';

describe('a Tjm', () => {
  it('is carried as integer cents', () => {
    expect(tjmCentsFromEuros(650)).toBe(65_000);
    expect(CENTS_PER_EURO).toBe(100);
  });

  it('refuses a rate that is not a whole number of euros', () => {
    // 650,50 € would make `tjmCents / 2` land on a half-cent, and the only division this
    // repository allows would stop being exact. The refusal is the guard on that premise.
    expect(() => tjmCentsFromEuros(650.5)).toThrow(InvalidValueError);
    expect(() => tjmCentsFromEuros(Number.NaN)).toThrow(InvalidValueError);
    expect(() => tjmCentsFromEuros(Number.POSITIVE_INFINITY)).toThrow(InvalidValueError);
  });

  it('refuses a rate of zero or below', () => {
    expect(() => tjmCentsFromEuros(0)).toThrow(InvalidValueError);
    expect(() => tjmCentsFromEuros(-650)).toThrow(InvalidValueError);
  });

  it('always produces an even number of cents, whatever the rate', () => {
    for (let euros = 1; euros <= 2000; euros += 1) {
      const cents = tjmCentsFromEuros(euros);

      expect(Number.isInteger(cents)).toBe(true);
      expect(cents % 2).toBe(0);
    }
  });
});
