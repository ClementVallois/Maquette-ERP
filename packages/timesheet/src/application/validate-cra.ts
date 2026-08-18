import {
  type Clock,
  type EventBus,
  TIMESHEET_VALIDATED,
  TIMESHEET_VALIDATED_VERSION,
  type TimesheetValidated,
} from '@erp/platform';

import type { Cra } from '../domain/cra.ts';
import type { Hierarchy } from '../domain/hierarchy.ts';
import type { ConsultantId } from '../domain/ids.ts';

export interface ValidateCraDependencies {
  readonly clock: Clock;
  readonly events: EventBus;
}

export interface ValidateCraCommand {
  readonly cra: Cra;
  readonly validatedBy: ConsultantId;
  /** Dated: the Cra of a month is accepted by the manager of that month (ADR-0034). */
  readonly hierarchy: Hierarchy;
  /** The chain this validation belongs to. Generated at the edge, from the incoming request. */
  readonly correlationId: string;
  readonly causationId?: string | null;
}

/**
 * A manager accepts a month, and the fact is published. `timesheet` does not know that `billing`
 * exists, and this function has no reference to it: that absence is the whole property ADR-0001
 * bought, and the test asserts it by mocking nothing.
 *
 * Loading and saving the Cra is not here. There is no repository in this phase — Phase 3 adds one,
 * with the transaction that makes the validation and the draft invoice commit together or not at
 * all.
 */
export async function validateCra(
  dependencies: ValidateCraDependencies,
  command: ValidateCraCommand,
): Promise<TimesheetValidated> {
  const payload = command.cra.validate({
    by: command.validatedBy,
    clock: dependencies.clock,
    hierarchy: command.hierarchy,
  });

  const event: TimesheetValidated = {
    type: TIMESHEET_VALIDATED,
    version: TIMESHEET_VALIDATED_VERSION,
    occurredAt: dependencies.clock.now(),
    correlationId: command.correlationId,
    causationId: command.causationId ?? null,
    payload,
  };

  await dependencies.events.publish(event);

  return event;
}
