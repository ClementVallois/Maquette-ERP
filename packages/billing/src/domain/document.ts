import { DocumentDoesNotAddUpError } from './errors.ts';
import type { InvoiceLine } from './invoice-line.ts';
import { applyRate } from './money.ts';
import { NOT_CHARGED_MENTIONS, type VatTreatment, vatGroupKey } from './vat.ts';

/**
 * What an invoice and a credit note have in common: lines, a recapitulative per rate, totals, and
 * the check that the three agree. One implementation, because a credit note that summed
 * differently from the invoice it reverses is the discrepancy this whole module exists to prevent.
 */

/**
 * One row of the recapitulative the document is legally required to print. A group that carries no
 * French VAT has **no** tax amount — `null`, not zero — and carries the mention saying why instead
 * (ADR-0010): 0 % is a rate, "outside the scope of the tax" is not.
 */
export interface VatGroup {
  readonly key: string;
  readonly treatment: VatTreatment;
  readonly baseCents: number;
  readonly vatCents: number | null;
  readonly mention: string | null;
}

export interface DocumentTotals {
  readonly totalExcludingVatCents: number;
  readonly vatTotalCents: number;
  readonly totalIncludingVatCents: number;
}

/** Anything that has to add up before it leaves. */
export interface AccountableDocument {
  readonly id: string;
  readonly lines: readonly InvoiceLine[];
  readonly vatBreakdown: readonly VatGroup[];
  readonly totals: DocumentTotals;
}

/**
 * The recapitulative, and the one place VAT is computed. Lines are grouped by rate, the base is
 * summed over the group, and the rate is applied **once** to that sum — which is what "rounded per
 * rate" means (ADR-0010). Rounding each line and adding the results is a different number, and it
 * is the one-cent discrepancy accounting reports.
 */
export function vatBreakdownOf(lines: readonly InvoiceLine[]): readonly VatGroup[] {
  const groups = new Map<string, { treatment: VatTreatment; baseCents: number }>();

  for (const line of lines) {
    const key = vatGroupKey(line.vat);
    const group = groups.get(key) ?? { treatment: line.vat, baseCents: 0 };
    groups.set(key, { treatment: group.treatment, baseCents: group.baseCents + line.amountCents });
  }

  return [...groups]
    .map(([key, group]) => ({
      key,
      treatment: group.treatment,
      baseCents: group.baseCents,
      vatCents:
        group.treatment.kind === 'taxable'
          ? applyRate(group.baseCents, group.treatment.basisPoints)
          : null,
      mention:
        group.treatment.kind === 'taxable' ? null : NOT_CHARGED_MENTIONS[group.treatment.reason],
    }))
    .sort((left, right) => left.key.localeCompare(right.key));
}

export function totalsOf(lines: readonly InvoiceLine[]): DocumentTotals {
  const totalExcludingVatCents = lines.reduce((sum, line) => sum + line.amountCents, 0);
  const vatTotalCents = vatBreakdownOf(lines).reduce(
    (sum, group) => sum + (group.vatCents ?? 0),
    0,
  );

  return {
    totalExcludingVatCents,
    vatTotalCents,
    totalIncludingVatCents: totalExcludingVatCents + vatTotalCents,
  };
}

/**
 * The gate a document passes before it leaves: `total HT = Σ lines` and
 * `total TTC = total HT + Σ VAT per rate`. A mismatch is a typed refusal, not a log line.
 *
 * On a document whose totals were just computed from its own lines this is tautological, and it is
 * not written for that case. It is written for the one Phase 3 creates: a document **reconstructed
 * from stored rows**, where the totals are columns and the lines are another table, and where the
 * two can disagree. Running it at issuance as well is what keeps it exercised until then.
 */
export function assertDocumentAddsUp(document: AccountableDocument): void {
  const lineSum = document.lines.reduce((sum, line) => sum + line.amountCents, 0);
  const baseSum = document.vatBreakdown.reduce((sum, group) => sum + group.baseCents, 0);
  const vatSum = document.vatBreakdown.reduce((sum, group) => sum + (group.vatCents ?? 0), 0);

  const refuse = (field: string, stated: number, computed: number): never => {
    throw new DocumentDoesNotAddUpError(document.id, field, stated, computed);
  };

  if (document.totals.totalExcludingVatCents !== lineSum) {
    refuse('totalExcludingVatCents', document.totals.totalExcludingVatCents, lineSum);
  }
  if (baseSum !== lineSum) {
    // Every line is in exactly one group and every group is made of lines. A base that does not
    // match is a line that reached the page without reaching the recapitulative.
    refuse('vatBreakdown.baseCents', baseSum, lineSum);
  }
  if (document.totals.vatTotalCents !== vatSum) {
    refuse('vatTotalCents', document.totals.vatTotalCents, vatSum);
  }
  if (document.totals.totalIncludingVatCents !== lineSum + vatSum) {
    refuse('totalIncludingVatCents', document.totals.totalIncludingVatCents, lineSum + vatSum);
  }
}
