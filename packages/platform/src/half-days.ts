import { InvalidValueError } from './errors.ts';

/**
 * A count of half-days. The single unit in which worked time is recorded and transported
 * (ADR-0012): never hours, never a fraction of a day.
 *
 * A plain integer, like a monetary value in cents (ADR-0002) and for the same reason: a wrapper
 * around `+` buys nothing here. The factory is what refuses an invalid count.
 */
export type HalfDays = number;

/** A full working day. Named so that `* 2` and `/ 2` never appear bare in a rule. */
export const HALF_DAYS_PER_DAY = 2;

export function halfDays(count: number): HalfDays {
  if (!Number.isInteger(count)) {
    throw new InvalidValueError('halfDays', count, 'a whole number of half-days');
  }
  if (count < 0) {
    throw new InvalidValueError('halfDays', count, 'zero or more half-days');
  }

  return count;
}
