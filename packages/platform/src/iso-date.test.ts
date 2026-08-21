import { describe, expect, it } from 'vitest';

import { InvalidValueError } from './errors.ts';
import {
  addDays,
  dayOfWeek,
  daysInMonth,
  endOfMonth,
  fromDayNumber,
  isLeapYear,
  isoDate,
  isoDateInFirmTimeZone,
  isoDateOf,
  MONDAY,
  partsOf,
  SATURDAY,
  SUNDAY,
  toDayNumber,
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

  it('refuses to answer about a month that does not exist', () => {
    // Both take an `IsoDate`, which is a string alias: nothing in the type system stops a caller
    // from handing them something `isoDate()` never saw. Answering 0 days, or Monday, would be
    // worse than refusing.
    expect(() => daysInMonth(2026, 13)).toThrow(InvalidValueError);
    expect(() => daysInMonth(2026, 0)).toThrow(InvalidValueError);
    expect(() => dayOfWeek('2026-13-01')).toThrow(InvalidValueError);
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

describe('civil-date arithmetic', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-03-30', 3)).toBe('2026-04-02');
  });

  it('adds days across a year boundary', () => {
    expect(addDays('2026-12-30', 5)).toBe('2027-01-04');
  });

  it('adds days across the leap day, and across the non-leap one', () => {
    // 2028 is a leap year, 2026 is not, and February is the month a day-number conversion gets
    // wrong when the year is not shifted to start in March.
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2100-02-28', 1)).toBe('2100-03-01');
    expect(addDays('2000-02-28', 1)).toBe('2000-02-29');
  });

  it('moves backwards on a negative count, and stands still on zero', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2026-03-01', 0)).toBe('2026-03-01');
  });

  it('round-trips every day of a leap year through its day number', () => {
    // The property that matters: the conversion is a bijection. A test of five dates would pass
    // on an implementation that is wrong for one month.
    let date = '2028-01-01';
    for (let index = 0; index < 366; index += 1) {
      expect(fromDayNumber(toDayNumber(date))).toBe(date);
      date = addDays(date, 1);
    }

    expect(date).toBe('2029-01-01');
  });

  it('refuses a count that is not a whole number of days', () => {
    expect(() => addDays('2026-03-01', 1.5)).toThrow(InvalidValueError);
  });

  it('answers the last day of a month, February included', () => {
    expect(endOfMonth('2026-03-15')).toBe('2026-03-31');
    expect(endOfMonth('2026-02-01')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-01')).toBe('2028-02-29');
    expect(endOfMonth('2026-04-30')).toBe('2026-04-30');
  });
});

describe('isoDateOf', () => {
  it('passes a string straight through, after checking it is a date', () => {
    expect(isoDateOf('2026-04-02')).toBe('2026-04-02');
    expect(() => isoDateOf('2026-02-30')).toThrow();
  });

  it('undoes the local construction pg performs, rather than reading UTC off it', () => {
    // This is the one that was wrong, silently, for two phases. `pg` builds a DATE with the local
    // constructor, so on a machine east of Greenwich the instant is the PREVIOUS day in UTC.
    // Reading UTC parts back answers the 1st for a column holding the 2nd — an off-by-one visible
    // in Paris and invisible on a UTC CI runner, which is the worst combination available.
    const asPgBuildsIt = new Date(2026, 3, 2);

    expect(isoDateOf(asPgBuildsIt)).toBe('2026-04-02');
  });

  it('round-trips every day of a month, whatever the offset', () => {
    for (let day = 1; day <= 31; day++) {
      expect(isoDateOf(new Date(2026, 0, day))).toBe(`2026-01-${String(day).padStart(2, '0')}`);
    }
  });

  it('handles the two days a timezone shift actually falls on', () => {
    // Europe/Paris moves on the last Sunday of March and October.
    expect(isoDateOf(new Date(2026, 2, 29))).toBe('2026-03-29');
    expect(isoDateOf(new Date(2026, 9, 25))).toBe('2026-10-25');
  });
});

describe('isoDateInFirmTimeZone', () => {
  it('answers the day the firm is on, not the day UTC is on', () => {
    // 00:30 in Paris on 2 July is 22:30 UTC on 1 July. `toISOString().slice(0, 10)` answers the
    // 1st for a document issued on the 2nd.
    expect(isoDateInFirmTimeZone(new Date('2026-07-01T22:30:00.000Z'))).toBe('2026-07-02');
  });

  it('does not send a new year back into the previous fiscal year', () => {
    // The one that matters: 00:30 in Paris on 1 January 2027 is 23:30 UTC on 31 December 2026,
    // and the fiscal year is half the key the invoice series is numbered by (ADR-0007).
    expect(isoDateInFirmTimeZone(new Date('2026-12-31T23:30:00.000Z'))).toBe('2027-01-01');
  });

  it('reads the offset from the zone, which is +1 in winter and +2 in summer', () => {
    // 22:30 UTC is already the next day in Paris in summer (+2) and not yet in winter (+1). The
    // same instant-of-day therefore answers two different calendar days depending on the month,
    // which is what a hand-written offset cannot do.
    expect(isoDateInFirmTimeZone(new Date('2026-07-15T22:30:00.000Z'))).toBe('2026-07-16');
    expect(isoDateInFirmTimeZone(new Date('2026-01-15T22:30:00.000Z'))).toBe('2026-01-15');
  });

  it('is unmoved by mid-day, which is why the test clock hid this', () => {
    expect(isoDateInFirmTimeZone(new Date('2026-07-02T09:00:00.000Z'))).toBe('2026-07-02');
  });
});
