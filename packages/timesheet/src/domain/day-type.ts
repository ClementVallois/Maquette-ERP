/**
 * What a calendar day counts as for a consultant. Only `worked` reaches an invoice.
 *
 * Two of the four are decided by the calendar and two by the consultant: a day is a `weekend` or a
 * `publicHoliday` whatever anyone records on it, while `worked` and `absence` are the record.
 */
export const DAY_TYPES = ['worked', 'absence', 'publicHoliday', 'weekend'] as const;

export type DayType = (typeof DAY_TYPES)[number];

/** The two the calendar decides, never the consultant. */
export type NonWorkableDay = Extract<DayType, 'publicHoliday' | 'weekend'>;

/**
 * The two a consultant records. A weekend is not an entry — the calendar already knows the day is
 * one — so recording a day as `weekend` would be a second, contradictable source for a fact the
 * calendar owns.
 */
export type RecordedDayType = Extract<DayType, 'worked' | 'absence'>;

export function isBillable(dayType: DayType): boolean {
  return dayType === 'worked';
}
