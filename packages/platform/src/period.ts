import { InvalidValueError } from './errors.ts';
import { daysInMonth, type IsoDate, partsOf, toIsoDate } from './iso-date.ts';

/**
 * The month a Cra covers. A Cra is monthly, and every dated rule in the chain — the manager who
 * validates, the Tjm that applies — is resolved against a day inside this period rather than
 * against the day the screen was opened.
 */
export interface Period {
  readonly year: number;
  readonly month: number;
}

const ISO_MONTH = /^(\d{4})-(\d{2})$/;

export function period(year: number, month: number): Period {
  if (!Number.isInteger(year) || year < 2000 || year > 2999) {
    throw new InvalidValueError('period.year', year, 'a year between 2000 and 2999');
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new InvalidValueError('period.month', month, 'a month between 1 and 12');
  }

  return { year, month };
}

export function periodFromIso(value: string): Period {
  if (!ISO_MONTH.test(value)) {
    throw new InvalidValueError('period', value, 'a month written YYYY-MM');
  }

  return period(Number.parseInt(value.slice(0, 4), 10), Number.parseInt(value.slice(5, 7), 10));
}

export function periodToIso({ year, month }: Period): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function periodOf(date: IsoDate): Period {
  const { year, month } = partsOf(date);

  return period(year, month);
}

export function containsDay(target: Period, date: IsoDate): boolean {
  return date.startsWith(`${periodToIso(target)}-`);
}

export function daysOf({ year, month }: Period): IsoDate[] {
  return Array.from({ length: daysInMonth(year, month) }, (_unused, index) =>
    toIsoDate(year, month, index + 1),
  );
}

export function lastDayOf({ year, month }: Period): IsoDate {
  return toIsoDate(year, month, daysInMonth(year, month));
}
