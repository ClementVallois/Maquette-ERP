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
 * French public holidays, 2016–2027, written out rather than computed (ADR-0004, ADR-0078).
 * ADR-0004's own threshold — "the day the mockup spans a second year" — is met by item 6 (QA
 * round 1): the seed's historical data reaches back to 2016, so the table now covers every year
 * that data can name, not only 2026.
 *
 * The three movable ones hang off Easter Sunday, computed independently for each year: Easter
 * Monday is Easter + 1, Ascension is Easter + 39, Whit Monday is Easter + 50 — which is why their
 * position within a year's eleven dates is not fixed (2027's Ascension, 6 May, falls two days
 * *before* the fixed 8 May Victoire 1945, reordering that pair relative to every other year here).
 * The tests assert every one of them falls on the weekday it must fall on, for every year in the
 * table, which is what makes a mistyped date fail rather than bill a holiday.
 */
export const PUBLIC_HOLIDAYS: readonly IsoDate[] = [
  // 2016 — Easter Sunday 2016-03-27 (Sunday)
  '2016-01-01', // Jour de l'an (Friday)
  '2016-03-28', // Lundi de Pâques (Monday)
  '2016-05-01', // Fête du Travail (Sunday)
  '2016-05-05', // Ascension (Thursday)
  '2016-05-08', // Victoire 1945 (Sunday)
  '2016-05-16', // Lundi de Pentecôte (Monday)
  '2016-07-14', // Fête nationale (Thursday)
  '2016-08-15', // Assomption (Monday)
  '2016-11-01', // Toussaint (Tuesday)
  '2016-11-11', // Armistice 1918 (Friday)
  '2016-12-25', // Noël (Sunday)
  // 2017 — Easter Sunday 2017-04-16 (Sunday)
  '2017-01-01', // Jour de l'an (Sunday)
  '2017-04-17', // Lundi de Pâques (Monday)
  '2017-05-01', // Fête du Travail (Monday)
  '2017-05-08', // Victoire 1945 (Monday)
  '2017-05-25', // Ascension (Thursday)
  '2017-06-05', // Lundi de Pentecôte (Monday)
  '2017-07-14', // Fête nationale (Friday)
  '2017-08-15', // Assomption (Tuesday)
  '2017-11-01', // Toussaint (Wednesday)
  '2017-11-11', // Armistice 1918 (Saturday)
  '2017-12-25', // Noël (Monday)
  // 2018 — Easter Sunday 2018-04-01 (Sunday)
  '2018-01-01', // Jour de l'an (Monday)
  '2018-04-02', // Lundi de Pâques (Monday)
  '2018-05-01', // Fête du Travail (Tuesday)
  '2018-05-08', // Victoire 1945 (Tuesday)
  '2018-05-10', // Ascension (Thursday)
  '2018-05-21', // Lundi de Pentecôte (Monday)
  '2018-07-14', // Fête nationale (Saturday)
  '2018-08-15', // Assomption (Wednesday)
  '2018-11-01', // Toussaint (Thursday)
  '2018-11-11', // Armistice 1918 (Sunday)
  '2018-12-25', // Noël (Tuesday)
  // 2019 — Easter Sunday 2019-04-21 (Sunday)
  '2019-01-01', // Jour de l'an (Tuesday)
  '2019-04-22', // Lundi de Pâques (Monday)
  '2019-05-01', // Fête du Travail (Wednesday)
  '2019-05-08', // Victoire 1945 (Wednesday)
  '2019-05-30', // Ascension (Thursday)
  '2019-06-10', // Lundi de Pentecôte (Monday)
  '2019-07-14', // Fête nationale (Sunday)
  '2019-08-15', // Assomption (Thursday)
  '2019-11-01', // Toussaint (Friday)
  '2019-11-11', // Armistice 1918 (Monday)
  '2019-12-25', // Noël (Wednesday)
  // 2020 — Easter Sunday 2020-04-12 (Sunday)
  '2020-01-01', // Jour de l'an (Wednesday)
  '2020-04-13', // Lundi de Pâques (Monday)
  '2020-05-01', // Fête du Travail (Friday)
  '2020-05-08', // Victoire 1945 (Friday)
  '2020-05-21', // Ascension (Thursday)
  '2020-06-01', // Lundi de Pentecôte (Monday)
  '2020-07-14', // Fête nationale (Tuesday)
  '2020-08-15', // Assomption (Saturday)
  '2020-11-01', // Toussaint (Sunday)
  '2020-11-11', // Armistice 1918 (Wednesday)
  '2020-12-25', // Noël (Friday)
  // 2021 — Easter Sunday 2021-04-04 (Sunday)
  '2021-01-01', // Jour de l'an (Friday)
  '2021-04-05', // Lundi de Pâques (Monday)
  '2021-05-01', // Fête du Travail (Saturday)
  '2021-05-08', // Victoire 1945 (Saturday)
  '2021-05-13', // Ascension (Thursday)
  '2021-05-24', // Lundi de Pentecôte (Monday)
  '2021-07-14', // Fête nationale (Wednesday)
  '2021-08-15', // Assomption (Sunday)
  '2021-11-01', // Toussaint (Monday)
  '2021-11-11', // Armistice 1918 (Thursday)
  '2021-12-25', // Noël (Saturday)
  // 2022 — Easter Sunday 2022-04-17 (Sunday)
  '2022-01-01', // Jour de l'an (Saturday)
  '2022-04-18', // Lundi de Pâques (Monday)
  '2022-05-01', // Fête du Travail (Sunday)
  '2022-05-08', // Victoire 1945 (Sunday)
  '2022-05-26', // Ascension (Thursday)
  '2022-06-06', // Lundi de Pentecôte (Monday)
  '2022-07-14', // Fête nationale (Thursday)
  '2022-08-15', // Assomption (Monday)
  '2022-11-01', // Toussaint (Tuesday)
  '2022-11-11', // Armistice 1918 (Friday)
  '2022-12-25', // Noël (Sunday)
  // 2023 — Easter Sunday 2023-04-09 (Sunday)
  '2023-01-01', // Jour de l'an (Sunday)
  '2023-04-10', // Lundi de Pâques (Monday)
  '2023-05-01', // Fête du Travail (Monday)
  '2023-05-08', // Victoire 1945 (Monday)
  '2023-05-18', // Ascension (Thursday)
  '2023-05-29', // Lundi de Pentecôte (Monday)
  '2023-07-14', // Fête nationale (Friday)
  '2023-08-15', // Assomption (Tuesday)
  '2023-11-01', // Toussaint (Wednesday)
  '2023-11-11', // Armistice 1918 (Saturday)
  '2023-12-25', // Noël (Monday)
  // 2024 — Easter Sunday 2024-03-31 (Sunday)
  '2024-01-01', // Jour de l'an (Monday)
  '2024-04-01', // Lundi de Pâques (Monday)
  '2024-05-01', // Fête du Travail (Wednesday)
  '2024-05-08', // Victoire 1945 (Wednesday)
  '2024-05-09', // Ascension (Thursday)
  '2024-05-20', // Lundi de Pentecôte (Monday)
  '2024-07-14', // Fête nationale (Sunday)
  '2024-08-15', // Assomption (Thursday)
  '2024-11-01', // Toussaint (Friday)
  '2024-11-11', // Armistice 1918 (Monday)
  '2024-12-25', // Noël (Wednesday)
  // 2025 — Easter Sunday 2025-04-20 (Sunday)
  '2025-01-01', // Jour de l'an (Wednesday)
  '2025-04-21', // Lundi de Pâques (Monday)
  '2025-05-01', // Fête du Travail (Thursday)
  '2025-05-08', // Victoire 1945 (Thursday)
  '2025-05-29', // Ascension (Thursday)
  '2025-06-09', // Lundi de Pentecôte (Monday)
  '2025-07-14', // Fête nationale (Monday)
  '2025-08-15', // Assomption (Friday)
  '2025-11-01', // Toussaint (Saturday)
  '2025-11-11', // Armistice 1918 (Tuesday)
  '2025-12-25', // Noël (Thursday)
  // 2026 — Easter Sunday 2026-04-05 (Sunday)
  '2026-01-01', // Jour de l'an (Thursday)
  '2026-04-06', // Lundi de Pâques (Monday)
  '2026-05-01', // Fête du Travail (Friday)
  '2026-05-08', // Victoire 1945 (Friday)
  '2026-05-14', // Ascension (Thursday)
  '2026-05-25', // Lundi de Pentecôte (Monday)
  '2026-07-14', // Fête nationale (Tuesday)
  '2026-08-15', // Assomption (Saturday)
  '2026-11-01', // Toussaint (Sunday)
  '2026-11-11', // Armistice 1918 (Wednesday)
  '2026-12-25', // Noël (Friday)
  // 2027 — Easter Sunday 2027-03-28 (Sunday)
  '2027-01-01', // Jour de l'an (Friday)
  '2027-03-29', // Lundi de Pâques (Monday)
  '2027-05-01', // Fête du Travail (Saturday)
  '2027-05-06', // Ascension (Thursday)
  '2027-05-08', // Victoire 1945 (Saturday)
  '2027-05-17', // Lundi de Pentecôte (Monday)
  '2027-07-14', // Fête nationale (Wednesday)
  '2027-08-15', // Assomption (Sunday)
  '2027-11-01', // Toussaint (Monday)
  '2027-11-11', // Armistice 1918 (Thursday)
  '2027-12-25', // Noël (Saturday)
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

export function workingCalendar(holidays: readonly IsoDate[] = PUBLIC_HOLIDAYS): WorkingCalendar {
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
