import { type HalfDays, InvalidValueError } from '@erp/platform';

import type { CraId, MissionId } from './ids.ts';
import { lineAmountCents } from './money.ts';
import type { VatTreatment } from './vat.ts';

/**
 * Where a line came from. One variant exists — days of `Regie` — and it is a tagged union from the
 * first line written, for the reason ADR-0013 gives: a line that has to learn a second origin
 * later is the retrofit that reaches every query, every screen and every issued document.
 *
 * The origin is also the audit trail. A reader of the invoice can go back to the `Cra` that
 * produced the line, which is what makes the CRA → line → invoice chain a _piste d'audit fiable_
 * rather than a claim.
 */
export interface RegieDaysOrigin {
  readonly kind: 'RegieDays';
  readonly missionId: MissionId;
  readonly craId: CraId;
  /** The month worked, `YYYY-MM`. The rate below is the one in force then, not the one in force now. */
  readonly period: string;
  readonly halfDays: HalfDays;
  /** The contractual daily rate, **copied** onto the line and never referenced (ADR-0034). */
  readonly tjmCents: number;
}

export type LineOrigin = RegieDaysOrigin;

/**
 * One line of an invoice, frozen. Quantity is a count of half-days and the unit price is the price
 * of one half-day: the unit that is recorded is the unit that is transported and the unit that is
 * billed (ADR-0012), with no conversion — and no decimal quantity — anywhere on the way.
 *
 * Everything a line needs to be read again in five years is on it: the rate, the VAT treatment,
 * and the record it came from. Nothing here points at a reference table.
 */
export interface InvoiceLine {
  /** The printed text. French, because it is printed on a French document. */
  readonly designation: string;
  readonly origin: LineOrigin;
  readonly quantityHalfDays: HalfDays;
  readonly unitPriceCents: number;
  readonly amountCents: number;
  readonly vat: VatTreatment;
}

export function regieLine(input: {
  designation: string;
  missionId: MissionId;
  craId: CraId;
  period: string;
  halfDays: HalfDays;
  tjmCents: number;
  vat: VatTreatment;
}): InvoiceLine {
  if (input.designation.trim() === '') {
    throw new InvalidValueError('invoiceLine.designation', input.designation, 'a designation');
  }
  if (input.halfDays <= 0) {
    // A line worth nothing is not a line. It would print on the invoice, sum to zero, and leave
    // the reader looking for the day it is about.
    throw new InvalidValueError('invoiceLine.halfDays', input.halfDays, 'at least one half-day');
  }

  // Both amounts go through the same function, which is what keeps the claim in BUILD-RULES true:
  // one division, at one call site, asserting one precondition. `unitPrice × quantity` equals
  // `amountCents` exactly because a Tjm is even, and a reference test asserts it.
  return {
    designation: input.designation,
    origin: {
      kind: 'RegieDays',
      missionId: input.missionId,
      craId: input.craId,
      period: input.period,
      halfDays: input.halfDays,
      tjmCents: input.tjmCents,
    },
    quantityHalfDays: input.halfDays,
    unitPriceCents: lineAmountCents(1, input.tjmCents),
    amountCents: lineAmountCents(input.halfDays, input.tjmCents),
    vat: input.vat,
  };
}
