import { PgNumberingCounter } from '@erp/billing';
import { type Actor, type Clock, isoDateInFirmTimeZone } from '@erp/platform';

import type { Transactionally } from '../persistence/unit-of-work.ts';

/**
 * Issuing a draft: allocating the number and freezing the document (ADR-0007, ADR-0018).
 *
 * The number is allocated by locking the counter row inside **this** transaction, so a rollback
 * takes the number with it — which is the whole reason it is not a Postgres `SEQUENCE`.
 *
 * `Idempotency-Key` (ADR-0044) is the caller's half of the same guarantee. Without it, a client
 * that retries after a timeout it never saw the answer to issues a second document and burns a
 * second number; with it, the retry is recognised and the first document comes back.
 *
 * A retry is the *same request* arriving twice, which is why the key alone is not enough to
 * recognise one: a key that already issued a different document is a client bug, and answering it
 * with the first document's number would report success for a document that was never issued.
 */

export interface IssueInvoiceDependencies {
  readonly transactionally: Transactionally;
  readonly clock: Clock;
}

export interface IssueInvoiceCommand {
  readonly invoiceId: string;
  readonly actor: Actor;
  readonly idempotencyKey: string;
}

export interface IssueInvoiceOutcome {
  readonly kind: 'issued' | 'replayed' | 'keyReused' | 'notFound';
  readonly invoiceId: string;
  readonly invoiceNumber: string | null;
  readonly issueDate: string | null;
  readonly totalTtcCents: number | null;
}

export async function issueInvoice(
  dependencies: IssueInvoiceDependencies,
  command: IssueInvoiceCommand,
): Promise<IssueInvoiceOutcome> {
  return dependencies.transactionally(async (unit) => {
    // The replay check comes first, and it is scoped: an actor who may not read the invoice does
    // not learn from this route whether their key was used on one.
    const alreadyIssued = await unit.invoices.findIssuedWithKey(
      command.idempotencyKey,
      command.actor,
    );
    if (alreadyIssued !== null && alreadyIssued.id !== command.invoiceId) {
      return {
        kind: 'keyReused',
        invoiceId: command.invoiceId,
        invoiceNumber: null,
        issueDate: null,
        totalTtcCents: null,
      };
    }

    if (alreadyIssued !== null) {
      return {
        kind: 'replayed',
        invoiceId: alreadyIssued.id,
        invoiceNumber: alreadyIssued.invoiceNumber,
        issueDate: alreadyIssued.issueDate,
        totalTtcCents: alreadyIssued.totalTtcCents,
      };
    }

    const invoice = await unit.invoices.findById(command.invoiceId, command.actor);
    if (invoice === null) {
      return {
        kind: 'notFound',
        invoiceId: command.invoiceId,
        invoiceNumber: null,
        issueDate: null,
        totalTtcCents: null,
      };
    }

    const issueDate = isoDateInFirmTimeZone(dependencies.clock.now());
    const counter = new PgNumberingCounter(unit.client);
    const fiscalYear = Number.parseInt(issueDate.slice(0, 4), 10);

    // Everything that can refuse — the draft status, and rule 2 of separation of duties — runs
    // inside `issue()` *after* the sequence is handed over, so a refusal rolls back with the
    // transaction and the number is never burned. That is what makes the series gapless rather
    // than merely sequential.
    const sequence = await counter.nextSequence(invoice.seller.id, fiscalYear);
    invoice.issue({ by: command.actor.consultantId, sequence, issueDate });

    await unit.invoices.save(invoice, { issuanceIdempotencyKey: command.idempotencyKey });

    return {
      kind: 'issued',
      invoiceId: invoice.id,
      invoiceNumber: invoice.number,
      issueDate,
      totalTtcCents: invoice.totals.totalIncludingVatCents,
    };
  });
}
