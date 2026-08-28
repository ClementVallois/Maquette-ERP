import { InvalidValueError } from './errors.ts';

/**
 * A count of quarter-days. The single unit in which worked time is recorded and transported
 * (ADR-0069, superseding ADR-0012's half-day): never hours, never a fraction of a day.
 *
 * A plain integer, like a monetary value in cents (ADR-0002) and for the same reason: a wrapper
 * around `+` buys nothing here. The factory is what refuses an invalid count.
 */
export type QuarterDays = number;

/** A full working day. Named so that `* 4` and `/ 4` never appear bare in a rule. */
export const QUARTER_DAYS_PER_DAY = 4;

export function quarterDays(count: number): QuarterDays {
  if (!Number.isInteger(count)) {
    throw new InvalidValueError('quarterDays', count, 'a whole number of quarter-days');
  }
  if (count < 0) {
    throw new InvalidValueError('quarterDays', count, 'zero or more quarter-days');
  }

  return count;
}
