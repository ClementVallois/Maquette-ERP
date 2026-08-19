import { TechnicalFailure } from '@erp/platform';

/**
 * A column the schema declares as an integer came back as something else. Not retryable: the same
 * row will answer the same way, and the fault is in the data or the migration, not in the network.
 */
export class ColumnIsNotAnExactIntegerError extends TechnicalFailure {
  readonly retryable = false;

  constructor(column: string, value: string | number) {
    super(`column ${column} must hold an exact integer, got ${String(value)}`);
  }
}

// `node-postgres` parses INTEGER to a number and hands BIGINT back as a string, because a bigint
// does not fit a JS number in general. One column therefore arrives as either, and which one is
// not a property of the value — it is a property of the column's declared type.
const EXACT_INTEGER = /^-?\d+$/;

/**
 * Reads an integer column — every monetary amount in this schema is `bigint` cents — as an exact
 * JS integer, or refuses.
 *
 * Two refusals, and they are different faults. A decimal tail means the column is not what the
 * schema says it is; `Number.parseInt` would silently truncate it. A magnitude past
 * `Number.MAX_SAFE_INTEGER` means the value cannot be represented at all, and the arithmetic
 * downstream would be wrong without saying so.
 */
export function exactInteger(column: string, value: string | number): number {
  if (typeof value === 'string' && !EXACT_INTEGER.test(value)) {
    throw new ColumnIsNotAnExactIntegerError(column, value);
  }

  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;

  if (!Number.isSafeInteger(parsed)) {
    throw new ColumnIsNotAnExactIntegerError(column, value);
  }

  return parsed;
}

/**
 * A row an existing foreign key points at came back empty. Not retryable for the same reason as
 * above: the same query will answer the same way until the data is repaired.
 */
export class ReferencedRowMissingError extends TechnicalFailure {
  readonly retryable = false;

  constructor(table: string, id: string) {
    super(`${table} has no row with id ${id}, though a foreign key points at it`);
  }
}
