import { describe, expect, it } from 'vitest';

import { InvalidValueError } from './errors.ts';
import { QUARTER_DAYS_PER_DAY, quarterDays } from './quarter-days.ts';

describe('a count of quarter-days', () => {
  it('is a whole number of quarter-days', () => {
    expect(quarterDays(0)).toBe(0);
    expect(quarterDays(3)).toBe(3);
    expect(QUARTER_DAYS_PER_DAY).toBe(4);
  });

  it('refuses a fraction of a quarter-day', () => {
    // The refusal ADR-0069 (and ADR-0012 before it) exists for: 0.5 day, 3.5 hours and 7h30 all
    // arrive as a float, and every one of them ends up dividing a Tjm by something other than four.
    expect(() => quarterDays(1.5)).toThrow(InvalidValueError);
    expect(() => quarterDays(0.5)).toThrow(InvalidValueError);
    expect(() => quarterDays(Number.NaN)).toThrow(InvalidValueError);
  });

  it('refuses a negative count', () => {
    expect(() => quarterDays(-1)).toThrow(InvalidValueError);
  });
});
