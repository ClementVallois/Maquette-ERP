import { HALF_DAYS_PER_DAY, type HalfDays, InvalidValueError } from '@erp/platform';

/**
 * Every arithmetic operation this module performs on a monetary value, and the only place a
 * division appears. Amounts are integer cents (ADR-0002), rates are integer basis points, and
 * rounding is half-up written on integers (ADR-0035) — the ESLint block that forbids the float
 * forms is the mechanical half of the same decision.
 */

/** A rate of 100 %. 20 % is 2 000, 8,5 % is 850 — never 0.2, never 0.085. */
export const BASIS_POINTS_DENOMINATOR = 10_000;

const BASIS_POINTS_PER_PERCENT = 100;

/**
 * Half-up, on integers, with no float anywhere on the path.
 *
 * `numerator - remainder` is a multiple of `denominator` by construction, so the division that
 * follows is exact rather than rounded — which is what makes this a rounding function and not a
 * recovery from one. `Math.round` is banned for the opposite reason: it takes a float, so needing
 * it means a float already exists.
 */
export function roundHalfUp(numerator: number, denominator: number): number {
  assertExactInteger('roundHalfUp.numerator', numerator);
  assertExactInteger('roundHalfUp.denominator', denominator);

  if (numerator < 0) {
    // ADR-0036: an amount is never negative here, and half-up is not symmetric across zero — it
    // would round -0,5 away from the direction it rounds +0,5. A credit note carries positive
    // amounts and its document type carries the direction.
    throw new InvalidValueError('roundHalfUp.numerator', numerator, 'zero or more');
  }
  if (denominator <= 0) {
    throw new InvalidValueError('roundHalfUp.denominator', denominator, 'above zero');
  }

  const remainder = numerator % denominator;
  const truncated = (numerator - remainder) / denominator;

  return remainder * 2 >= denominator ? truncated + 1 : truncated;
}

/** A whole percentage as basis points. The readable way to write the metropolitan rate. */
export function wholePercent(percent: number): number {
  assertExactInteger('wholePercent', percent);
  if (percent < 0 || percent > BASIS_POINTS_PER_PERCENT) {
    throw new InvalidValueError('wholePercent', percent, 'a percentage between 0 and 100');
  }

  return percent * BASIS_POINTS_PER_PERCENT;
}

/**
 * Applies a rate to an amount and rounds the result once. The rounding happens here and nowhere
 * else, which is what lets ADR-0010's "once per rate" be a call count rather than a convention.
 */
export function applyRate(amountCents: number, basisPoints: number): number {
  assertExactInteger('applyRate.basisPoints', basisPoints);
  if (basisPoints < 0 || basisPoints > BASIS_POINTS_DENOMINATOR) {
    throw new InvalidValueError('applyRate.basisPoints', basisPoints, 'a rate between 0 and 100 %');
  }

  return roundHalfUp(amountCents * basisPoints, BASIS_POINTS_DENOMINATOR);
}

/**
 * What a count of half-days on one mission is worth: `(halfDays * tjmCents) / 2`.
 *
 * Multiply first, divide last — and the assertion that `tjmCents` is even is the precondition of
 * the single division this repository allows, not a formality. A Tjm is a whole number of euros
 * (ADR-0002), so it is a multiple of 100 and the division is exact; a rate that reached here
 * without passing `tjmCentsFromEuros` would not be, and the refusal names it.
 */
export function lineAmountCents(quantity: HalfDays, tjmCents: number): number {
  assertExactInteger('lineAmountCents.halfDays', quantity);
  assertExactInteger('lineAmountCents.tjmCents', tjmCents);

  if (tjmCents % HALF_DAYS_PER_DAY !== 0) {
    throw new InvalidValueError('lineAmountCents.tjmCents', tjmCents, 'an even number of cents');
  }
  if (quantity < 0) {
    throw new InvalidValueError('lineAmountCents.halfDays', quantity, 'zero or more half-days');
  }
  if (tjmCents < 0) {
    throw new InvalidValueError('lineAmountCents.tjmCents', tjmCents, 'zero or more cents');
  }

  return (quantity * tjmCents) / HALF_DAYS_PER_DAY;
}

/**
 * `Number.isSafeInteger` and not `Number.isInteger`: past 2^53 a double stops holding every
 * integer, `+ 1` silently answers itself, and every claim of exactness above becomes false.
 */
function assertExactInteger(field: string, value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new InvalidValueError(field, value, 'a whole number inside the exact integer range');
  }
}
