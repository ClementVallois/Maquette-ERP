import { describe, expect, it } from 'vitest';

import { InvalidValueError } from './errors.ts';
import {
  containsDay,
  daysOf,
  lastDayOf,
  period,
  periodFromIso,
  periodOf,
  periodToIso,
} from './period.ts';

describe('a Cra period', () => {
  it('is a year and a month', () => {
    expect(period(2026, 3)).toStrictEqual({ year: 2026, month: 3 });
  });

  it('refuses a month outside 1 to 12', () => {
    expect(() => period(2026, 0)).toThrow(InvalidValueError);
    expect(() => period(2026, 13)).toThrow(InvalidValueError);
    expect(() => period(2026, 3.5)).toThrow(InvalidValueError);
  });

  it('refuses a year that is not four digits', () => {
    expect(() => period(26, 3)).toThrow(InvalidValueError);
    expect(() => period(2026.5, 3)).toThrow(InvalidValueError);
  });

  it('reads and writes YYYY-MM', () => {
    expect(periodFromIso('2026-03')).toStrictEqual({ year: 2026, month: 3 });
    expect(periodToIso({ year: 2026, month: 3 })).toBe('2026-03');
  });

  it('refuses a month string that is not YYYY-MM', () => {
    // `2026-03-01` is the trap: a day where a month is expected, and it is a real date.
    for (const malformed of ['2026-03-01', '2026-3', '03-2026', 'mars 2026']) {
      expect(() => periodFromIso(malformed)).toThrow(InvalidValueError);
    }
  });

  it('knows which period a day falls in', () => {
    expect(periodOf('2026-03-09')).toStrictEqual({ year: 2026, month: 3 });
    expect(containsDay(period(2026, 3), '2026-03-31')).toBe(true);
    expect(containsDay(period(2026, 3), '2026-04-01')).toBe(false);
    expect(containsDay(period(2026, 3), '2025-03-15')).toBe(false);
  });

  it('lists its days, and knows its last one', () => {
    const march = daysOf(period(2026, 3));

    expect(march).toHaveLength(31);
    expect(march[0]).toBe('2026-03-01');
    expect(march.at(-1)).toBe('2026-03-31');
    expect(lastDayOf(period(2026, 2))).toBe('2026-02-28');
    expect(lastDayOf(period(2024, 2))).toBe('2024-02-29');
  });
});
