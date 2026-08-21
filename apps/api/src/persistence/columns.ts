import { ApiFailure } from '../errors.ts';

/**
 * A `BIGINT` column as an integer, refusing anything that is not one.
 *
 * `pg` returns `BIGINT` as a **string**, because the range exceeds a JS number. `Number()` on it
 * is banned repository-wide (ADR-0035): it turns a decimal string into a float without saying so,
 * and a monetary value that has become a float has already lost the property this build exists to
 * hold. `Number.parseInt` says which conversion it is doing, and this refuses the two cases where
 * it would lie — a decimal tail it would silently truncate, and a magnitude past
 * `MAX_SAFE_INTEGER` where the integer it returns is not the integer that was stored.
 *
 * `billing` has its own copy of this reasoning in `infrastructure/columns.ts`; this one exists
 * because the composition root reads the same kind of column and may not import it — the
 * dependency rule grants an app a module's public index, and a driver-shaped helper has no
 * business on a public index.
 */
export function exactCents(column: string, value: string | number): number {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      throw new ApiFailure(`${column} is not a safe integer: ${String(value)}`);
    }

    return value;
  }

  if (!/^-?\d+$/u.test(value)) {
    throw new ApiFailure(`${column} is not an integer string: ${value}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new ApiFailure(`${column} exceeds the safe integer range: ${value}`);
  }

  return parsed;
}
