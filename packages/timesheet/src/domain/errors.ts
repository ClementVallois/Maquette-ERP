import { BusinessError } from '@erp/platform';

/**
 * The working calendar was asked about a year it does not hold. ADR-0004 keeps a written table
 * for 2026 alone and requires this to be loud: a silent answer would treat an unknown public
 * holiday as an ordinary working day, and bill it.
 */
export class UnknownCalendarYearError extends BusinessError {
  readonly problemType = '/problems/unknown-calendar-year';

  constructor(year: number, known: readonly number[]) {
    super(`the working calendar holds ${known.join(', ')} and was asked about ${String(year)}`, {
      year,
      known,
    });
  }
}
