import { dayOfWeek, MONDAY, period, SATURDAY } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { UnknownCalendarYearError } from './errors.ts';
import { PUBLIC_HOLIDAYS_2026, workingCalendar } from './working-calendar.ts';

const calendar = workingCalendar();

// The kernel names the two weekdays its own rules need; Ascension needs a third.
const THURSDAY = 4;

describe('the working calendar', () => {
  it('holds the eleven French public holidays of 2026', () => {
    expect(PUBLIC_HOLIDAYS_2026).toHaveLength(11);
    expect(calendar.isPublicHoliday('2026-05-01')).toBe(true);
    expect(calendar.isPublicHoliday('2026-12-25')).toBe(true);
    expect(calendar.isPublicHoliday('2026-05-02')).toBe(false);
  });

  it('puts the three movable feasts on the weekday they must fall on', () => {
    // Easter Sunday 2026 is 5 April. A mistyped date in the table stays plausible to the eye and
    // is caught here: Easter Monday and Whit Monday are Mondays, Ascension is a Thursday.
    expect(dayOfWeek('2026-04-06')).toBe(MONDAY);
    expect(dayOfWeek('2026-05-25')).toBe(MONDAY);
    expect(dayOfWeek('2026-05-14')).toBe(THURSDAY);
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
    // ADR-0004's threshold, made mechanical: the table is written for 2026 and answering
    // anything about 2027 would silently turn an unknown public holiday into a billable day.
    expect(() => calendar.isWorkable('2027-01-04')).toThrow(UnknownCalendarYearError);
    expect(() => calendar.isPublicHoliday('2025-12-25')).toThrow(UnknownCalendarYearError);
    expect(() => calendar.workableDaysOf(period(2027, 3))).toThrow(UnknownCalendarYearError);
  });

  it('names the year it was asked about and the years it holds', () => {
    try {
      calendar.isWorkable('2027-01-04');
      expect.unreachable('the calendar should have refused the year');
    } catch (error) {
      expect((error as UnknownCalendarYearError).details).toStrictEqual({
        year: 2027,
        known: [2026],
      });
    }
  });
});
