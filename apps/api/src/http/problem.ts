import { API_PROBLEM_TYPES, type ProblemDetails } from '@erp/contracts';
import { type BusinessError, isBusinessError } from '@erp/platform';

/**
 * Where a business refusal becomes an HTTP answer (ADR-0016 fixes that it happens here; ADR-0042
 * fixes which status each refusal takes).
 *
 * The table is keyed by `problemType` and never by class, so a module can add an error without
 * this file importing it — the dependency rule grants `apps/` a module's public index and nothing
 * behind it, and an exhaustive `instanceof` chain would need the classes.
 *
 * A missing entry answers 500, which is silent, so `problem.test.ts` reads every `problemType`
 * literal out of the modules' sources and asserts each one is in this table. That test is the
 * reason the table can be a plain record.
 */

export const PROBLEM_JSON = 'application/problem+json';

const UNPROCESSABLE = 422;
const CONFLICT = 409;
const FORBIDDEN = 403;

/**
 * 422 — the value is refused by a rule about values. 409 — the value is fine and the *state*
 * refuses it. 403 — the caller may not, whoever they are and whatever the state.
 */
const STATUS_BY_PROBLEM_TYPE: Readonly<Record<string, number>> = {
  // @erp/platform
  '/problems/invalid-value': UNPROCESSABLE,

  // @erp/timesheet
  '/problems/unknown-calendar-year': UNPROCESSABLE,
  '/problems/mission-required': UNPROCESSABLE,
  '/problems/mission-not-allowed': UNPROCESSABLE,
  '/problems/day-outside-period': UNPROCESSABLE,
  '/problems/refusal-reason-required': UNPROCESSABLE,
  '/problems/unknown-mission': UNPROCESSABLE,
  '/problems/day-overbooked': CONFLICT,
  '/problems/validated-cra-is-immutable': CONFLICT,
  '/problems/cra-transition-not-allowed': CONFLICT,
  '/problems/mission-not-running': CONFLICT,
  '/problems/not-assigned': CONFLICT,
  '/problems/cra-incomplete': CONFLICT,
  // Separation of duties, rule 1 (ADR-0006): whoever records a Cra does not validate it.
  '/problems/self-validation-forbidden': FORBIDDEN,
  '/problems/not-the-manager': FORBIDDEN,

  // @erp/billing
  '/problems/payment-terms-too-long': UNPROCESSABLE,
  '/problems/invalid-payment-term': UNPROCESSABLE,
  '/problems/no-vat-rate': CONFLICT,
  '/problems/empty-invoice': CONFLICT,
  '/problems/line-outside-invoice-period': CONFLICT,
  '/problems/invalid-sequence': CONFLICT,
  '/problems/invoice-transition-not-allowed': CONFLICT,
  '/problems/document-does-not-add-up': CONFLICT,
  '/problems/cra-already-processed': CONFLICT,
  '/problems/not-an-issued-invoice': CONFLICT,
  // Separation of duties, rule 2 (ADR-0006): whoever validates does not issue the invoice.
  '/problems/validator-cannot-issue': FORBIDDEN,
};

export function statusForProblemType(problemType: string): number | undefined {
  return STATUS_BY_PROBLEM_TYPE[problemType];
}

/** Every problem type this table answers for. Used by the test that proves it is exhaustive. */
export function mappedProblemTypes(): readonly string[] {
  return Object.keys(STATUS_BY_PROBLEM_TYPE);
}

const INTERNAL = 500;

export interface ProblemContext {
  readonly instance: string;
  readonly correlationId: string;
}

/**
 * `details` reaches the wire only for a refusal that is **not** a 403. ADR-0016's reconsideration
 * threshold names this exact hazard: a permission refusal is modelled as a `BusinessError`, and
 * its details would describe the resource the caller was told they may not see. Until it has its
 * own base class, the serialisation rule is here.
 */
export function problemFromBusinessError(
  error: BusinessError,
  context: ProblemContext,
): ProblemDetails {
  const status = statusForProblemType(error.problemType) ?? INTERNAL;

  if (status === INTERNAL) {
    return internalProblem(context);
  }

  const base = {
    type: error.problemType,
    title: error.name,
    status,
    detail: error.message,
    instance: context.instance,
    correlationId: context.correlationId,
  };

  if (status === FORBIDDEN) {
    return { ...base, deniedBy: error.problemType };
  }
  if (status === CONFLICT) {
    return { ...base, invariant: error.problemType, ...asErrors(error.details) };
  }

  return { ...base, ...asErrors(error.details) };
}

function asErrors(details: Readonly<Record<string, unknown>>): {
  errors?: Record<string, string[]>;
} {
  const entries: [string, string[]][] = Object.entries(details).map(([field, value]) => [
    field,
    [readable(value)],
  ]);

  return entries.length === 0 ? {} : { errors: Object.fromEntries(entries) };
}

function readable(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value !== 'object' || value === null) return String(value);

  try {
    return JSON.stringify(value);
  } catch {
    return '[unprintable]';
  }
}

/**
 * The one refusal that publishes nothing. A technical failure says nothing the caller can act on,
 * and its message may quote a query or a connection — the correlation id is the whole payload,
 * and it is what ties the answer to the log line that does carry the detail.
 */
export function internalProblem(context: ProblemContext): ProblemDetails {
  return {
    type: API_PROBLEM_TYPES.internal,
    title: 'Internal error',
    status: INTERNAL,
    detail: 'The request could not be completed. Quote the correlation id when reporting it.',
    instance: context.instance,
    correlationId: context.correlationId,
  };
}

export function apiProblem(
  input: Omit<ProblemDetails, 'instance' | 'correlationId'>,
  context: ProblemContext,
): ProblemDetails {
  return { ...input, instance: context.instance, correlationId: context.correlationId };
}

/** Whether the wire mapping treats this as a refusal it can describe, or as an accident. */
export function isMappedBusinessError(error: unknown): error is BusinessError {
  return isBusinessError(error) && statusForProblemType(error.problemType) !== undefined;
}
