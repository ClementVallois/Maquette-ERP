import {
  dayOfWeek,
  daysOf,
  type IsoDate,
  partsOf,
  type Period,
  SATURDAY,
  SUNDAY,
} from '@erp/platform';

import type { NonWorkableDay } from './day-type.ts';
import { UnknownCalendarYearError } from './errors.ts';

/**
 * French public holidays for 2026, written out rather than computed (ADR-0004).
 *
 * The three movable ones hang off Easter Sunday, 5 April 2026: Easter Monday is the 6th,
 * Ascension is Easter + 39 days, Whit Monday is Easter + 50. The tests assert each of them falls
 * on the weekday it must fall on, which is what makes a mistyped table fail rather than bill a
 * holiday.
 */
export const PUBLIC_HOLIDAYS_2026: readonly IsoDate[] = [
  '2026-01-01', // Jour de l'an
  '2026-04-06', // Lundi de Pâques
  '2026-05-01', // Fête du Travail
  '2026-05-08', // Victoire 1945
  '2026-05-14', // Ascension
  '2026-05-25', // Lundi de Pentecôte
  '2026-07-14', // Fête nationale
  '2026-08-15', // Assomption
  '2026-11-01', // Toussaint
  '2026-11-11', // Armistice 1918
  '2026-12-25', // Noël
];

/**
 * The authority on which dates are workable in France, and therefore on what may be billed
 * (ADR-0004). It reads no clock: every question is asked about a date the caller passes in.
 */
export interface WorkingCalendar {
  readonly years: readonly number[];
  isWeekend(date: IsoDate): boolean;
  isPublicHoliday(date: IsoDate): boolean;
  isWorkable(date: IsoDate): boolean;
  /** Why a date is not workable, or `null` when it is. */
  nonWorkableReason(date: IsoDate): NonWorkableDay | null;
  workableDaysOf(target: Period): IsoDate[];
}

export function workingCalendar(
  holidays: readonly IsoDate[] = PUBLIC_HOLIDAYS_2026,
): WorkingCalendar {
  const table = new Set(holidays);
  const years = [...new Set(holidays.map((holiday) => partsOf(holiday).year))].sort(
    (left, right) => left - right,
  );

  function assertKnown(date: IsoDate): void {
    const { year } = partsOf(date);
    if (!years.includes(year)) throw new UnknownCalendarYearError(year, years);
  }

  const calendar: WorkingCalendar = {
    years,

    isWeekend(date) {
      assertKnown(date);
      const day = dayOfWeek(date);

      return day === SATURDAY || day === SUNDAY;
    },

    isPublicHoliday(date) {
      assertKnown(date);

      return table.has(date);
    },

    isWorkable(date) {
      return calendar.nonWorkableReason(date) === null;
    },

    nonWorkableReason(date) {
      if (calendar.isWeekend(date)) return 'weekend';
      if (calendar.isPublicHoliday(date)) return 'publicHoliday';

      return null;
    },

    workableDaysOf(target) {
      return daysOf(target).filter((date) => calendar.isWorkable(date));
    },
  };

  return calendar;
}
