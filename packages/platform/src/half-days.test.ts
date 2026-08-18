import { describe, expect, it } from 'vitest';

import { InvalidValueError } from './errors.ts';
import { HALF_DAYS_PER_DAY, halfDays } from './half-days.ts';

describe('a count of half-days', () => {
  it('is a whole number of half-days', () => {
    expect(halfDays(0)).toBe(0);
    expect(halfDays(3)).toBe(3);
    expect(HALF_DAYS_PER_DAY).toBe(2);
  });

  it('refuses a fraction of a half-day', () => {
    // The refusal ADR-0012 exists for: 0.5 day, 3.5 hours and 7h30 all arrive as a float, and
    // every one of them ends up dividing a Tjm by something other than two.
    expect(() => halfDays(1.5)).toThrow(InvalidValueError);
    expect(() => halfDays(0.5)).toThrow(InvalidValueError);
    expect(() => halfDays(Number.NaN)).toThrow(InvalidValueError);
  });

  it('refuses a negative count', () => {
    expect(() => halfDays(-1)).toThrow(InvalidValueError);
  });
});
