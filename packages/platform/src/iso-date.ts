import { InvalidValueError } from './errors.ts';

/**
 * A civil date — a day on a calendar, with no time and no zone: `YYYY-MM-DD`.
 *
 * Lexicographic order is chronological order for this format, so the domain compares two dates
 * with `<` and never builds a `Date` — the rule is in `docs/BUILD-RULES.md`, § Boundary and
 * layering, and the ESLint block that enforces it is the mechanical half. That is not a micro-optimisation: `new Date('2026-03-01')`
 * is an instant, it is read back through a zone, and a Cra day would shift by one over a
 * midnight boundary. The ESLint rule that forbids `new Date()` in the domain is the mechanical
 * half of the same decision.
 */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;

  const days = DAYS_IN_MONTH[month - 1];
  if (days === undefined) {
    throw new InvalidValueError('month', month, 'a month between 1 and 12');
  }

  return days;
}

export interface DateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/**
 * The only way into an `IsoDate`. Refuses a shape that is not `YYYY-MM-DD` and a date that does
 * not exist — 31 February parses fine as three integers and is not a day.
 */
export function isoDate(value: string): IsoDate {
  const match = ISO_DATE.exec(value);
  if (match === null) {
    throw new InvalidValueError('date', value, 'a calendar date written YYYY-MM-DD');
  }

  const { year, month, day } = partsOf(value);
  if (month < 1 || month > 12) {
    throw new InvalidValueError('date', value, 'a month between 01 and 12');
  }
  if (day < 1 || day > daysInMonth(year, month)) {
    throw new InvalidValueError(
      'date',
      value,
      `a day that exists in ${String(month)}/${String(year)}`,
    );
  }

  return value;
}

/** Splits a date that has already been through `isoDate`. */
export function partsOf(date: IsoDate): DateParts {
  return {
    year: Number.parseInt(date.slice(0, 4), 10),
    month: Number.parseInt(date.slice(5, 7), 10),
    day: Number.parseInt(date.slice(8, 10), 10),
  };
}

export function toIsoDate(year: number, month: number, day: number): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** ISO-8601 numbering: 1 is Monday, 7 is Sunday. */
export const MONDAY = 1;
export const SATURDAY = 6;
export const SUNDAY = 7;

// Sakamoto's algorithm. The table holds the offset of each month inside the year; January and
// February are treated as months of the previous year, which is why `year` is decremented for
// them — that is the leap-day correction, and removing it breaks exactly two months a year.
const MONTH_OFFSET = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];

export function dayOfWeek(date: IsoDate): number {
  const { year, month, day } = partsOf(date);
  const offset = MONTH_OFFSET[month - 1];
  if (offset === undefined) {
    throw new InvalidValueError('month', month, 'a month between 1 and 12');
  }

  const y = month < 3 ? year - 1 : year;
  const sundayFirst =
    (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + offset + day) % 7;

  return sundayFirst === 0 ? SUNDAY : sundayFirst;
}

/**
 * Civil-date arithmetic, done on integers. Building a `Date` would be the obvious implementation
 * and it is a lint error here for the reason the type's own comment gives: an instant read back
 * through a zone shifts a day over a midnight boundary, and a due date that moves by one is a
 * legal document that is wrong.
 *
 * The conversion is to a day number and back — the standard civil-from-days algorithm, shifted so
 * that the year starts in March and the leap day lands at the end of it, which is what removes
 * every special case for February.
 */
const DAYS_PER_ERA = 146_097;
const YEARS_PER_ERA = 400;
const MARCH = 3;

export function toDayNumber(date: IsoDate): number {
  const { year, month, day } = partsOf(date);
  const shiftedYear = month <= 2 ? year - 1 : year;
  const era = Math.floor(shiftedYear / YEARS_PER_ERA);
  const yearOfEra = shiftedYear - era * YEARS_PER_ERA;
  const dayOfYear = Math.floor((153 * (month + (month > 2 ? -MARCH : 9)) + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;

  return era * DAYS_PER_ERA + dayOfEra - 719_468;
}

export function fromDayNumber(days: number): IsoDate {
  const shifted = days + 719_468;
  const era = Math.floor(shifted / DAYS_PER_ERA);
  const dayOfEra = shifted - era * DAYS_PER_ERA;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36_524) -
      Math.floor(dayOfEra / (DAYS_PER_ERA - 1))) /
      365,
  );
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const monthOfShiftedYear = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * monthOfShiftedYear + 2) / 5) + 1;
  const month = monthOfShiftedYear + (monthOfShiftedYear < 10 ? MARCH : -9);
  const year = yearOfEra + era * YEARS_PER_ERA + (month <= 2 ? 1 : 0);

  return toIsoDate(year, month, day);
}

/** The same day of the calendar, `count` days later. A negative count moves backwards. */
export function addDays(date: IsoDate, count: number): IsoDate {
  if (!Number.isSafeInteger(count)) {
    throw new InvalidValueError('addDays.count', count, 'a whole number of days');
  }

  return fromDayNumber(toDayNumber(date) + count);
}

/** The last day of the month a date falls in. */
export function endOfMonth(date: IsoDate): IsoDate {
  const { year, month } = partsOf(date);

  return toIsoDate(year, month, daysInMonth(year, month));
}
