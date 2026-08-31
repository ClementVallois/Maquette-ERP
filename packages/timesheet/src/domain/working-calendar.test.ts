import { dayOfWeek, MONDAY, period, SATURDAY } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { UnknownCalendarYearError } from './errors.ts';
import { PUBLIC_HOLIDAYS, workingCalendar } from './working-calendar.ts';

const calendar = workingCalendar();

// The kernel names the two weekdays its own rules need; Ascension needs a third.
const THURSDAY = 4;

// The eight fixed-date holidays, by their `MM-DD` suffix — every table entry that does not match
// one of these is one of the three movable feasts (ADR-0078's own comment on why their relative
// order is not fixed: 2027's Ascension falls before that year's Victoire 1945).
const FIXED_HOLIDAY_MMDD = new Set([
  '01-01', // Jour de l'an
  '05-01', // Fête du Travail
  '05-08', // Victoire 1945
  '07-14', // Fête nationale
  '08-15', // Assomption
  '11-01', // Toussaint
  '11-11', // Armistice 1918
  '12-25', // Noël
]);

describe('the working calendar', () => {
  it('holds eleven French public holidays for every year from 2016 to 2027 (ADR-0078)', () => {
    expect(calendar.years).toStrictEqual([
      2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027,
    ]);
    expect(PUBLIC_HOLIDAYS).toHaveLength(11 * 12);
    for (const year of calendar.years) {
      expect(PUBLIC_HOLIDAYS.filter((date) => date.startsWith(String(year)))).toHaveLength(11);
    }
    expect(calendar.isPublicHoliday('2026-05-01')).toBe(true);
    expect(calendar.isPublicHoliday('2026-12-25')).toBe(true);
    expect(calendar.isPublicHoliday('2026-05-02')).toBe(false);
  });

  it('puts the three movable feasts on the weekday they must fall on, in every year the table holds', () => {
    // Extended from the single-year 2026 check (ADR-0004's own instruction, once the table spans
    // more than one year): Easter Monday and Whit Monday are always Mondays, Ascension is always
    // a Thursday — checked positionally by weekday, not by array index, since the three are not
    // always in the same relative order (2027).
    for (const year of calendar.years) {
      const yearHolidays = PUBLIC_HOLIDAYS.filter((date) => date.startsWith(String(year)));
      const movable = yearHolidays.filter((date) => !FIXED_HOLIDAY_MMDD.has(date.slice(5)));

      expect(movable).toHaveLength(3);
      expect(movable.filter((date) => dayOfWeek(date) === MONDAY)).toHaveLength(2);
      expect(movable.filter((date) => dayOfWeek(date) === THURSDAY)).toHaveLength(1);
    }
  });

  it('sees a weekend', () => {
    expect(calendar.isWeekend('2026-03-14')).toBe(true);
    expect(calendar.isWeekend('2026-03-15')).toBe(true);
    expect(calendar.isWeekend('2026-03-16')).toBe(false);
  });

  it('says why a day is not workable, and says nothing when it is', () => {
    expect(calendar.nonWorkableReason('2026-03-14')).toBe('weekend');
    expect(calendar.nonWorkableReason('2026-05-01')).toBe('publicHoliday');
    expect(calendar.nonWorkableReason('2026-03-16')).toBeNull();
    expect(calendar.isWorkable('2026-03-16')).toBe(true);
    expect(calendar.isWorkable('2026-05-01')).toBe(false);
  });

  it('counts the workable days of a month', () => {
    // March 2026 has no public holiday: 22 weekdays out of 31 days.
    expect(calendar.workableDaysOf(period(2026, 3))).toHaveLength(22);

    // May 2026 is the month that pays for the movable feasts: 1 and 8 May are Fridays,
    // Ascension is the 14th, Whit Monday the 25th. 21 weekdays, 4 holidays, 17 workable days.
    expect(calendar.workableDaysOf(period(2026, 5))).toHaveLength(17);
  });

  it('does not count a holiday that falls on a weekend twice', () => {
    // 15 August 2026 is a Saturday. It is a public holiday and a weekend day, and the month must
    // still come out at its weekday count minus the holidays that actually cost a working day.
    expect(dayOfWeek('2026-08-15')).toBe(SATURDAY);
    expect(calendar.workableDaysOf(period(2026, 8))).toHaveLength(21);
  });

  it('knows the years of the table it was built with, not 2026 by name', () => {
    // ADR-0004's threshold is "the day the mockup spans a second year". This is what extending
    // the table looks like, and it proves the year check reads the table rather than a constant.
    const twoYears = workingCalendar(['2026-12-25', '2027-01-01']);

    expect(twoYears.years).toStrictEqual([2026, 2027]);
    expect(twoYears.isPublicHoliday('2027-01-01')).toBe(true);
    expect(twoYears.isWorkable('2027-01-04')).toBe(true);
  });

  it('refuses loudly a year it does not know', () => {
    // ADR-0078's threshold, made mechanical: the table is written for 2016–2027 and answering
    // anything about 2028 (or 2015) would silently turn an unknown public holiday into a billable
    // day.
    expect(() => calendar.isWorkable('2028-01-04')).toThrow(UnknownCalendarYearError);
    expect(() => calendar.isPublicHoliday('2015-12-25')).toThrow(UnknownCalendarYearError);
    expect(() => calendar.workableDaysOf(period(2028, 3))).toThrow(UnknownCalendarYearError);
  });

  it('names the year it was asked about and the years it holds', () => {
    try {
      calendar.isWorkable('2028-01-04');
      expect.unreachable('the calendar should have refused the year');
    } catch (error) {
      expect((error as UnknownCalendarYearError).details).toStrictEqual({
        year: 2028,
        known: [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027],
      });
    }
  });
});
