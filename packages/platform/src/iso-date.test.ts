import { describe, expect, it } from 'vitest';

import { InvalidValueError } from './errors.ts';
import {
  dayOfWeek,
  daysInMonth,
  isLeapYear,
  isoDate,
  MONDAY,
  partsOf,
  SATURDAY,
  SUNDAY,
  toIsoDate,
} from './iso-date.ts';

describe('a civil date', () => {
  it('accepts a well-formed day', () => {
    expect(isoDate('2026-03-09')).toBe('2026-03-09');
  });

  it('refuses anything that is not YYYY-MM-DD', () => {
    for (const malformed of ['09/03/2026', '2026-3-9', '2026-03-09T00:00:00Z', '', 'yesterday']) {
      expect(() => isoDate(malformed)).toThrow(InvalidValueError);
    }
  });

  it('refuses a date that does not exist', () => {
    // The refusal that matters: these three parse as integers and would pass a regex-only check.
    expect(() => isoDate('2026-02-30')).toThrow(InvalidValueError);
    expect(() => isoDate('2026-13-01')).toThrow(InvalidValueError);
    expect(() => isoDate('2026-04-31')).toThrow(InvalidValueError);
  });

  it('accepts 29 February on a leap year and refuses it otherwise', () => {
    expect(isoDate('2024-02-29')).toBe('2024-02-29');
    expect(() => isoDate('2026-02-29')).toThrow(InvalidValueError);
  });

  it('names the field and the value it refused', () => {
    try {
      isoDate('2026-02-30');
      expect.unreachable('the date should have been refused');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidValueError);
      expect((error as InvalidValueError).details).toMatchObject({
        field: 'date',
        value: '2026-02-30',
      });
    }
  });

  it('knows the leap years, including the century rule', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('counts the days of a month', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it('splits and rebuilds a date', () => {
    expect(partsOf('2026-03-09')).toStrictEqual({ year: 2026, month: 3, day: 9 });
    expect(toIsoDate(2026, 3, 9)).toBe('2026-03-09');
  });

  it('numbers the days of the week from Monday, as ISO-8601 does', () => {
    expect(dayOfWeek('2026-03-09')).toBe(MONDAY);
    expect(dayOfWeek('2026-03-14')).toBe(SATURDAY);
    expect(dayOfWeek('2026-03-15')).toBe(SUNDAY);
  });

  it('gets the day of the week right across a leap day', () => {
    // The two months Sakamoto's year adjustment exists for: January and February. A build that
    // dropped it answers correctly for March onwards and is wrong here.
    expect(dayOfWeek('2024-02-29')).toBe(4);
    expect(dayOfWeek('2024-01-01')).toBe(MONDAY);
    expect(dayOfWeek('2026-01-01')).toBe(4);
    expect(dayOfWeek('2026-12-31')).toBe(4);
  });
});
