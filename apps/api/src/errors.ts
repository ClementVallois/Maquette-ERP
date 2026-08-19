import { TechnicalFailure } from '@erp/platform';

/**
 * The application edge gave way — a persona row that contradicts its own CHECK constraint, a
 * handler reached without the actor its route declared. Never retryable: the same call fails the
 * same way until a deployment or a code change makes it not.
 *
 * It exists so that `apps/api` has something to throw that is not a bare `Error`, which the lint
 * rule forbids everywhere. A caller sees the generic 500 of ADR-0042 — a technical failure names
 * no business rule, so there is nothing to publish.
 */
export class ApiFailure extends TechnicalFailure {
  readonly retryable = false;
}
