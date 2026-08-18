import { describe, expect, it } from 'vitest';

import { DAY_TYPES, isBillable } from './day-type.ts';

describe('a day type', () => {
  it('bills a worked day and nothing else', () => {
    // The single place the rule lives: the aggregate asks this question when it breaks a month
    // down per mission, so an absence cannot reach an invoice by way of a second copy of it.
    expect(isBillable('worked')).toBe(true);
    expect(isBillable('absence')).toBe(false);
    expect(isBillable('publicHoliday')).toBe(false);
    expect(isBillable('weekend')).toBe(false);
  });

  it('has the four values the vocabulary names', () => {
    expect([...DAY_TYPES]).toStrictEqual(['worked', 'absence', 'publicHoliday', 'weekend']);
  });
});
