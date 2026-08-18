/**
 * Two kinds of failure, and nothing in between. See docs/adr/0016.
 *
 * A `BusinessError` is expected: it is part of the contract, it names a rule the caller broke, and
 * retrying it unchanged fails again. A `TechnicalFailure` is not: the rule was never evaluated,
 * something under the code gave way, and the same call may succeed later.
 */

/**
 * A rule of the domain refused. `problemType` is the stable identifier of that refusal — the
 * `type` member of the RFC 9457 document the API builds from it (docs/adr/0016). Nothing here
 * knows about HTTP: the status code is chosen on the other side of the boundary.
 */
export abstract class BusinessError extends Error {
  abstract readonly problemType: string;

  /** The business fields of the refusal: what was violated, with the values that violated it. */
  readonly details: Readonly<Record<string, unknown>>;

  constructor(message: string, details: Readonly<Record<string, unknown>> = {}) {
    super(message);
    // `new.target` is the subclass being constructed. Without this, every error reports `Error`
    // in a log line, because `name` is read off the prototype of the base class.
    this.name = new.target.name;
    this.details = details;
  }
}

/**
 * Something the domain does not model gave way — a lost connection, a timeout, a disk. Carries no
 * `problemType`: there is no business rule to name, and the wire answer is a generic 500.
 */
export abstract class TechnicalFailure extends Error {
  /** Whether the identical call may succeed later. A caller decides to retry on this, not on the class. */
  abstract readonly retryable: boolean;

  constructor(message: string, options?: { cause: unknown }) {
    super(message, options);
    this.name = new.target.name;
  }
}

/**
 * The discriminator the wire mapping consumes: a business refusal is published with its type and
 * its fields, anything else is a 500 with nothing in it.
 */
export function isBusinessError(error: unknown): error is BusinessError {
  return error instanceof BusinessError;
}
