import {
  type DeclinedDaysRecord,
  draftInvoicesFrom,
  type InvoiceListItem,
  legalMentions,
  paymentTerms,
  RECOVERY_INDEMNITY_CENTS,
} from '@erp/billing';
import {
  type Actor,
  type Clock,
  TIMESHEET_VALIDATED,
  type TimesheetValidated,
} from '@erp/platform';
import { validateCra } from '@erp/timesheet';

import { PgReferenceReader } from '../persistence/reference-reader.ts';
import type { Transactionally } from '../persistence/unit-of-work.ts';

import { inProcessEventBus } from './event-bus.ts';

/**
 * The chain this repository exists to demonstrate, composed: a manager validates a month, and the
 * draft invoices appear — **in one transaction, or not at all**.
 *
 * What makes the guarantee real is not this function but `Transactionally`: every repository here
 * is built over one checked-out client, so `billing`'s write and `timesheet`'s write are the same
 * transaction (ADR-0001). The subscriber writes through that same client and performs no side
 * effect outside it — no HTTP call, no queue publish, nothing a rollback could not undo.
 *
 * `billing` is still not imported by `timesheet`, and nothing here mocks either: the event goes
 * onto a bus, and the bus is what the drafting handler is subscribed to. That absence is the
 * property ADR-0001 bought, and it survives composition.
 */

/** The firm's commercial policy. Not seeded reference data: one policy, stated here, printed there. */
const TERMS = paymentTerms({ kind: 'endOfMonth', days: 30 });
const MENTIONS = legalMentions({
  latePaymentBasisPoints: 1500,
  recoveryIndemnityCents: RECOVERY_INDEMNITY_CENTS,
  earlyPaymentDiscount: { kind: 'none' },
  operationCategory: 'services',
  vatOnDebitsOption: false,
});

export interface ValidateCraDependencies {
  readonly transactionally: Transactionally;
  readonly clock: Clock;
  readonly newId: () => string;
}

export interface ValidateCraCommand {
  readonly craId: string;
  readonly actor: Actor;
  readonly correlationId: string;
}

export interface ValidateCraOutcome {
  readonly kind: 'validated' | 'replayed' | 'notFound';
  readonly craId: string;
  readonly invoices: readonly InvoiceListItem[];
  readonly declined: readonly DeclinedDaysRecord[];
}

export async function validateCraAndDraftInvoices(
  dependencies: ValidateCraDependencies,
  command: ValidateCraCommand,
): Promise<ValidateCraOutcome> {
  return dependencies.transactionally(async (unit) => {
    // Locked (ADR-0103): a concurrent `refuse` or `validate` on this Cra blocks here until this
    // transaction commits, then reads the state this call left — never a copy of the state both
    // started from. That is what lets the checks below answer against the truth, not a race.
    const cra = await unit.cras.findByIdForWrite(command.craId, command.actor);
    if (cra === null) {
      return { kind: 'notFound', craId: command.craId, invoices: [], declined: [] };
    }

    // ADR-0021, layer one: the application guard. Replaying answers the **original result**, not
    // a rejection — which needs the documents, and is why the port gained `findDraftedFrom`.
    // Layer two is `Cra.validate()`'s own immutability check, which only a race can reach now
    // that this read is locked (ADR-0103) — and which answers *some* status that is not
    // `submitted`, never specifically "already validated", the day a `refused` Cra reaches here.
    //
    // The receipt is the Cra's own persisted status (ADR-0104), not whether `billing` produced a
    // row: `validate()` is the only path to `status: 'validated'`, so the status already IS the
    // durable, unique fact ADR-0021 needs — one that is true for a mixed-billing, all-Forfait,
    // all-declined, or absence-only Cra alike, where "did an invoice appear" is true for exactly
    // one of those four.
    if (cra.status === 'validated') {
      return {
        kind: 'replayed',
        craId: command.craId,
        invoices: await unit.invoices.findDraftedFrom(command.craId, command.actor),
        declined: await unit.invoices.findDeclinedDays([command.craId], command.actor),
      };
    }

    // Sequential, and not `Promise.all`: these four reads share **one** checked-out client — the
    // chain's transaction is that client — and `pg` serialises concurrent queries on a single one
    // anyway. Overlapping them bought nothing and cost the deprecation `pg` prints on every run,
    // whose removal in pg@9 turns this into a throw on the route the whole mockup demonstrates.
    const reference = new PgReferenceReader(unit.client);
    const billingReference = await reference.billing();
    const seller = await reference.seller();
    const missionNames = await reference.missionNames();
    const consultantNames = await reference.consultantNames();
    const hierarchy = await reference.hierarchy();

    // The subscriber, running inside the emitter's transaction. It writes through `unit`, which
    // IS the ambient transaction — the one thing ADR-0001 forbids is I/O that leaves it.
    const onValidated = async (event: TimesheetValidated): Promise<void> => {
      const consultantName =
        consultantNames.get(event.payload.consultantId) ?? event.payload.consultantId;
      const result = draftInvoicesFrom(
        {
          reference: billingReference,
          seller,
          terms: TERMS,
          mentions: MENTIONS,
          newInvoiceId: () => dependencies.newId(),
          designation: ({ missionId, period }) =>
            `Prestation ${missionNames.get(missionId) ?? missionId} — ${consultantName} — ${period}`,
        },
        event,
      );

      for (const invoice of result.invoices) {
        await unit.invoices.saveDraft(invoice, event.payload.craId);
      }

      // `billing.declined_days`: the days a validated Cra carried that produced no line, with
      // the reason (ADR-0037). It is the blocking-reason column of the pré-facturier, and it is
      // written in the same transaction as the invoices whose absence it explains.
      await unit.invoices.saveDeclinedDays(
        event.payload.officeId,
        result.declined.map((entry) => ({
          craId: event.payload.craId,
          missionId: entry.missionId,
          quarterDays: entry.quarterDays,
          reason: entry.reason,
        })),
      );

      await unit.events.persist(event);
    };

    const events = inProcessEventBus();
    events.subscribe<TimesheetValidated>(TIMESHEET_VALIDATED, onValidated);

    // `timesheet` does not know `billing` exists; it publishes and ignores who listens.
    const event = await validateCra(
      { clock: dependencies.clock, events },
      {
        cra,
        validatedBy: command.actor.consultantId,
        hierarchy,
        correlationId: command.correlationId,
      },
    );

    await unit.cras.save(cra);

    return {
      kind: 'validated',
      craId: event.payload.craId,
      invoices: await unit.invoices.findDraftedFrom(command.craId, command.actor),
      declined: await unit.invoices.findDeclinedDays([command.craId], command.actor),
    };
  });
}
