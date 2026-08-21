import type { Actor } from './actor.ts';
import { BusinessError } from './errors.ts';

/**
 * The data-scope matrix of ADR-0023, in one place — which is what "one rule, one source" means
 * once the rule has two dimensions instead of one.
 *
 * It lives in the kernel for the reason ADR-0033 gives: both modules' repositories apply it, and
 * the dependency rule grants them `@erp/platform` and nothing else. A copy in each module would be
 * two copies of an authorization rule, which is the thing `docs/BUILD-RULES.md` forbids by name.
 *
 * What it is **not**: a permission check on an action. Whether a role may *attempt* an issuance is
 * declared on the route (ADR-0023), and whether an actor may act given who acted before them is a
 * domain rule (ADR-0006). This answers only: of the records that exist, which may they see.
 */

export const RESOURCES = ['cra', 'invoice', 'economics'] as const;

export type Resource = (typeof RESOURCES)[number];

/** `own` narrows to records about the actor; `office` widens to their `Office`; `none` is none. */
export type ReadScope = 'none' | 'own' | 'office';

const READ_SCOPE: Readonly<Record<Actor['role'], Readonly<Record<Resource, ReadScope>>>> = {
  // A consultant reads their own month and nothing else. They are not shown the invoice their
  // days produced: what it is worth to the firm is not theirs to see.
  consultant: { cra: 'own', invoice: 'none', economics: 'none' },
  manager: { cra: 'office', invoice: 'office', economics: 'office' },
  // Billing reads the CRA behind the line — that link is the *piste d'audit fiable* — and not the
  // cost of the consultant who produced it, which is not a billing input.
  billing: { cra: 'office', invoice: 'office', economics: 'none' },
};

export function readScope(actor: Actor, resource: Resource): ReadScope {
  return READ_SCOPE[actor.role][resource];
}

/**
 * The record exists and this actor may not read it.
 *
 * It is a refusal and not an absence, because ADR-0003 says the demonstration has two beats and
 * the second is "a direct API call on its URL refused with a 403 that names the rule that denied
 * it". A `null` cannot name a rule.
 *
 * It publishes nothing about the record. ADR-0042 keeps `details` off every 403, and this is the
 * refusal that rule was written for: naming the office or the consultant would describe exactly
 * what the caller has just been told they may not see.
 */
export class OutOfScopeError extends BusinessError {
  readonly problemType = '/problems/out-of-scope';

  constructor(resource: Resource) {
    super(`this ${resource} is outside the reach of your role and office`);
  }
}

export interface ScopedRecord {
  readonly officeId: string;
  /** The consultant the record is about. `null` for a record that is about no one in particular. */
  readonly subjectId: string | null;
}

/**
 * The single gate every read goes through. Returns nothing and throws on refusal, so a caller
 * cannot forget to branch on the answer — which is the failure mode a boolean would have.
 */
export function assertMayRead(actor: Actor, resource: Resource, record: ScopedRecord): void {
  const scope = readScope(actor, resource);

  if (scope === 'none') throw new OutOfScopeError(resource);
  if (record.officeId !== actor.officeId) throw new OutOfScopeError(resource);
  if (scope === 'own' && record.subjectId !== actor.consultantId) {
    throw new OutOfScopeError(resource);
  }
}
