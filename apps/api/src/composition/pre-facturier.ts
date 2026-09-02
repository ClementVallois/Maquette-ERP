import type { DeclineReason, InvoiceListItem, InvoiceStatus } from '@erp/billing';
import { type Actor, type IsoDate, lastDayOf, periodFromIso } from '@erp/platform';
import type { CraStatus } from '@erp/timesheet';

import { PgReferenceReader } from '../persistence/reference-reader.ts';
import type { UnitOfWork } from '../persistence/unit-of-work.ts';
import { carries, forRoles } from '../personas/access.ts';

/**
 * The pré-facturier's assembly (ADR-0053): for one month and one office, what is billable and, for
 * everything else, why not.
 *
 * Extracted from `web/routes.ts` in front-end plan Phase 5, which needed the same read for
 * `GET /api/v1/pre-facturier` and named the rule this obeys: "the compositions exist already ...
 * the endpoints reuse them, they do not reinvent them." The screen still owns the rendering
 * (`web/pages/pre-facturier.ts`); this owns the two module reads and the arithmetic between them.
 */

export const DECIDES_CRA = forRoles('manager');

/** Same cap as every other page of this list — ADR-0053 bounds the N+1 below by it. */
const MAX_MONTHS = 50;

export interface BillableRow {
  readonly invoiceId: string;
  readonly clientName: string;
  readonly status: InvoiceStatus;
  readonly invoiceNumber: string | null;
  readonly totalExcludingVatCents: number;
  readonly totalIncludingVatCents: number;
}

/**
 * `InvoiceListItem` plus what tells two drafts to the same client, same month, apart (Rank A7):
 * the source consultant, the mission(s) worked, how many lines, and when the draft was created —
 * `saveDraft` writes exactly one source Cra per invoice (the unique index on `(source_cra_ids[1],
 * billed_to_client_id)`), so that Cra's validation timestamp is the closest honest answer this
 * schema has to "when was this invoice created" — there is no `created_at` column on `invoices`.
 */
export interface PreFacturierInvoiceRow extends InvoiceListItem {
  readonly consultantName: string;
  readonly missionNames: readonly string[];
  readonly lineCount: number;
  readonly createdAt: string | null;
}

/** Why a quarter-day of this month is not on an invoice. Exactly two shapes, and they differ in kind. */
export type Blocking =
  /** The Cra was validated and the day still produced no line — ADR-0037's typed reason. */
  | { readonly kind: 'declined'; readonly reason: DeclineReason; readonly missionName: string }
  /** The Cra has not been validated, so nothing about it has reached billing yet. */
  | { readonly kind: 'notValidated'; readonly status: CraStatus };

export interface CraRow {
  readonly craId: string;
  readonly consultantId: string;
  readonly consultantName: string;
  readonly status: CraStatus;
  readonly recordedQuarterDays: number;
  readonly blocking: readonly { readonly quarterDays: number; readonly why: Blocking }[];
}

export interface PreFacturierComposition {
  /** `null` when this office has no Cra at all — an empty state, not a refusal. */
  readonly period: string | null;
  readonly offeredPeriods: readonly string[];
  /**
   * The month's invoices, `GET /api/v1/invoices`'s own shape plus the discriminant a screen needs
   * to tell two drafts to the same client apart (Rank A7) — see `PreFacturierInvoiceRow`.
   */
  readonly invoices: readonly PreFacturierInvoiceRow[];
  /** The same invoices, with the HT/TTC totals `billing.pages/pre-facturier.ts` prints. */
  readonly billable: readonly BillableRow[];
  readonly cras: readonly CraRow[];
  /** ADR-0054: quarter-days of a **closed** month that have not reached `Validated`. */
  readonly lateQuarterDays: number;
  readonly periodClosed: boolean;
  /**
   * Whether this actor may answer a submitted month. `false` for `billing`, which reads the same
   * table and decides nothing on it — the route refuses either way (ADR-0023), and this is only
   * the navigational echo of that.
   */
  readonly mayDecide: boolean;
}

/**
 * The months the period picker offers.
 *
 * Read off a page of Cras ordered by period descending, so it can omit an old month and never a
 * recent one — which is the behaviour a period picker wants. The selected month's rows come from a
 * second, period-filtered query (ADR-0053), so what the dropdown offers never bounds what the table
 * shows.
 *
 * Module-private since Phase 9.3: the pré-facturier's own screen imported it directly to build the
 * Cra list's picker, and that screen is `apps/web`'s now — it reads the `offeredPeriods` field of
 * the composition below, like every other consumer.
 */
function offeredPeriods(periods: readonly string[]): string[] {
  return [...new Set(periods)].sort((left, right) => right.localeCompare(left));
}

/**
 * Why the quarter-days of one `Cra` are not on an invoice — two shapes, and they differ in kind
 * (ADR-0037 for the first, `CraStatus` for the second).
 *
 * A `Validated` Cra has been through the chain, so everything not billed has a typed decline
 * reason. A Cra in any other status has not reached `billing` at all, and the block is the workflow
 * rather than a rule of billing: saying "no reason recorded" there would be false.
 */
function blockingOf(
  cra: { readonly id: string; readonly recordedQuarterDays: number },
  status: CraStatus,
  declined: readonly {
    craId: string;
    missionId: string;
    quarterDays: number;
    reason: DeclineReason;
  }[],
  missionNames: ReadonlyMap<string, string>,
): CraRow['blocking'] {
  if (status !== 'validated') {
    return cra.recordedQuarterDays === 0
      ? []
      : [{ quarterDays: cra.recordedQuarterDays, why: { kind: 'notValidated', status } }];
  }

  return declined
    .filter((record) => record.craId === cra.id)
    .map((record) => ({
      quarterDays: record.quarterDays,
      why: {
        kind: 'declined' as const,
        reason: record.reason,
        missionName: missionNames.get(record.missionId) ?? record.missionId,
      },
    }));
}

export interface PreFacturierInput {
  readonly actor: Actor;
  /** The `periode`/`period` query parameter, whichever spelling the caller's route uses. */
  readonly requestedPeriod: string | undefined;
  /** `isoDateInFirmTimeZone(clock.now())`, computed by the caller before the transaction opens. */
  readonly today: IsoDate;
}

export async function preFacturierComposition(
  unit: UnitOfWork,
  input: PreFacturierInput,
): Promise<PreFacturierComposition> {
  const { actor, requestedPeriod, today } = input;

  const availablePeriods = await unit.cras.listPeriods(actor);
  const period = requestedPeriod ?? availablePeriods[0] ?? null;
  // The month asked for is offered even when this office has no Cra in it. A picker that dropped
  // the current selection would answer a shared link by silently showing another month.
  const offered = offeredPeriods(
    period === null ? availablePeriods : [...availablePeriods, period],
  );

  if (period === null) {
    return {
      period: null,
      offeredPeriods: [],
      invoices: [],
      billable: [],
      cras: [],
      lateQuarterDays: 0,
      periodClosed: false,
      mayDecide: carries(DECIDES_CRA, actor.role),
    };
  }

  const cras = await unit.cras.list({ actor, limit: MAX_MONTHS, offset: 0, period });
  const declined = await unit.invoices.findDeclinedDays(
    cras.map((cra) => cra.id),
    actor,
  );
  const invoices = await unit.invoices.list({ actor, limit: MAX_MONTHS, offset: 0, period });

  const reference = new PgReferenceReader(unit.client);
  const consultantNames = await reference.consultantNames();
  const missionNames = await reference.missionNames();
  // `saveDraft` records exactly one source Cra per invoice — the unique index on
  // `(source_cra_ids[1], billed_to_client_id)` is what makes `cras`, already scoped to this same
  // period, the right (and only) place to resolve an invoice's consultant and "created" timestamp
  // from, rather than a second cross-module read.
  const craById = new Map(cras.map((cra) => [cra.id, cra]));

  // One read per invoice, and the totals come off the aggregate rather than out of a `SUM`
  // (ADR-0053): a draft's `total_ttc_cents` column is NULL by design, and VAT is rounded once per
  // rate in the domain — a total assembled in SQL would be a different number.
  const billable: BillableRow[] = [];
  const invoiceRows: PreFacturierInvoiceRow[] = [];
  for (const item of invoices) {
    const invoice = await unit.invoices.findById(item.id, actor);
    if (invoice === null) continue;

    billable.push({
      invoiceId: invoice.id,
      clientName: invoice.billedTo.name,
      status: invoice.status,
      invoiceNumber: invoice.number,
      totalExcludingVatCents: invoice.totals.totalExcludingVatCents,
      totalIncludingVatCents: invoice.totals.totalIncludingVatCents,
    });

    const sourceCraId = invoice.lines[0]?.origin.craId;
    const sourceCra = sourceCraId === undefined ? undefined : craById.get(sourceCraId);
    const lineMissionIds = [...new Set(invoice.lines.map((line) => line.origin.missionId))];

    invoiceRows.push({
      ...item,
      consultantName:
        sourceCra === undefined
          ? '—'
          : (consultantNames.get(sourceCra.consultantId) ?? sourceCra.consultantId),
      missionNames: lineMissionIds.map((id) => missionNames.get(id) ?? id),
      lineCount: invoice.lines.length,
      createdAt: sourceCra?.statusChangedAt ?? null,
    });
  }

  const periodClosed = lastDayOf(periodFromIso(period)) < today;

  const rows: CraRow[] = cras.map((cra) => {
    const status = cra.status as CraStatus;

    return {
      craId: cra.id,
      consultantId: cra.consultantId,
      consultantName: consultantNames.get(cra.consultantId) ?? cra.consultantId,
      status,
      recordedQuarterDays: cra.recordedQuarterDays,
      blocking: blockingOf(cra, status, declined, missionNames),
    };
  });

  return {
    period,
    offeredPeriods: offered,
    invoices: invoiceRows,
    billable,
    cras: rows,
    // ADR-0054: quarter-days of a closed month that have not reached `Validated`. Summed over the
    // rows the repository already scoped, so there is no second place the office rule could be
    // forgotten.
    lateQuarterDays: periodClosed
      ? rows
          .filter((row) => row.status !== 'validated')
          .reduce((total, row) => total + row.recordedQuarterDays, 0)
      : 0,
    periodClosed,
    // The navigational echo of the route's own declaration, and now literally that declaration:
    // `billing` reads this table and decides nothing on it, and `POST` refuses it whatever renders.
    mayDecide: carries(DECIDES_CRA, actor.role),
  };
}
