import type { Actor, Clock } from '@erp/platform';

import { PgReferenceReader } from '../persistence/reference-reader.ts';
import type { Transactionally } from '../persistence/unit-of-work.ts';

/**
 * A manager sends a month back, with a reason the consultant can act on.
 *
 * The one non-terminal answer a manager can give (ADR-0005), and the counterpart of
 * `validateCraAndDraftInvoices`: it is the same transition table, the same two separation-of-duties
 * rules, and the same dated manager attachment (ADR-0034) — reached through the aggregate, which is
 * where all three live. Nothing here decides anything; it loads, calls, and saves.
 *
 * **No event, and no subscriber.** A refusal produces nothing downstream: `billing` never learns
 * about a month that was not validated, which is the same boundary seen from the quiet side.
 */

export interface RefuseCraDependencies {
  readonly transactionally: Transactionally;
  readonly clock: Clock;
}

export interface RefuseCraCommand {
  readonly craId: string;
  readonly actor: Actor;
  readonly reason: string;
}

export interface RefuseCraOutcome {
  readonly kind: 'refused' | 'notFound';
  readonly craId: string;
}

export async function refuseCra(
  dependencies: RefuseCraDependencies,
  command: RefuseCraCommand,
): Promise<RefuseCraOutcome> {
  return dependencies.transactionally(async (unit) => {
    const cra = await unit.cras.findById(command.craId, command.actor);
    if (cra === null) return { kind: 'notFound', craId: command.craId };

    // `refuse` checks the status and refuses an empty reason; the hierarchy check is the manager
    // half of ADR-0006 and lives on the aggregate, so it is loaded for the same reason `validate`
    // loads it — the manager of the month, not the manager of today.
    const hierarchy = await new PgReferenceReader(unit.client).hierarchy();
    cra.refuse({
      by: command.actor.consultantId,
      reason: command.reason,
      clock: dependencies.clock,
      hierarchy,
    });

    await unit.cras.save(cra);

    return { kind: 'refused', craId: cra.id };
  });
}
