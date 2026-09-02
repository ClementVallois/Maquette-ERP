import { type Actor, assertMayRead, quarterDays, isoDateOf, readScope } from '@erp/platform';

import type { DocumentTotals } from '../domain/document.ts';
import { CraAlreadyProcessedError } from '../domain/errors.ts';
import type {
  ClientId,
  ConsultantId,
  CraId,
  InvoiceId,
  MissionId,
  OfficeId,
} from '../domain/ids.ts';
import type { InvoiceLine, LineOrigin } from '../domain/invoice-line.ts';
import type {
  DeclinedDaysRecord,
  InvoiceListItem,
  InvoiceListQuery,
  InvoiceRepository,
  InvoiceYearStatusCount,
} from '../domain/invoice-repository.ts';
import type { InvoiceStatus } from '../domain/invoice-status.ts';
import { type BilledParty, Invoice } from '../domain/invoice.ts';
import type { EarlyPaymentDiscount, LegalMentions, OperationCategory } from '../domain/mentions.ts';
import type { SeriesKey } from '../domain/numbering.ts';
import type { PaymentTerms } from '../domain/payment-terms.ts';
import type { LegalEntity } from '../domain/seller.ts';
import type { VatTreatment } from '../domain/vat.ts';

import { exactInteger, ReferencedRowMissingError } from './columns.ts';

const MAX_PAGE_SIZE = 50;

interface PgClient {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export class PgInvoiceRepository implements InvoiceRepository {
  readonly #client: PgClient;

  readonly #newId: () => string;

  /**
   * `newId` is injected rather than imported (ADR-0041): the generator lives in the composition
   * root, and the dependency rule grants this module `@erp/platform` and nothing else.
   */
  constructor(client: PgClient, newId: () => string) {
    this.#client = client;
    this.#newId = newId;
  }

  async findById(id: InvoiceId, actor: Actor): Promise<Invoice | null> {
    const { rows } = await this.#client.query<InvoiceRow>(
      `SELECT * FROM billing.invoices WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) return null;
    const row = rows[0]!;
    // An invoice is about no single consultant, so it carries no subject: the `own` scope cannot
    // apply to one, which is why `consultant` is given `none` on this resource rather than `own`.
    assertMayRead(actor, 'invoice', { officeId: row.office_id, subjectId: null });

    return this.#reconstitute(row);
  }

  /** Filtered, never refused — the first of ADR-0003's two beats. See `PgCraRepository.list`. */
  async list(query: InvoiceListQuery): Promise<readonly InvoiceListItem[]> {
    const limit = Math.min(query.limit, MAX_PAGE_SIZE);
    const { actor } = query;

    if (readScope(actor, 'invoice') === 'none') return [];

    const { rows } = await this.#client.query<InvoiceListRow>(
      `${INVOICE_LIST_SELECT}
       WHERE i.office_id = $1
         AND ($4::text IS NULL OR i.supply_period = $4)
       ORDER BY i.supply_period DESC, i.billed_to_name
       LIMIT $2 OFFSET $3`,
      [actor.officeId, limit, query.offset, query.period ?? null],
    );

    return rows.map(toListItem);
  }

  async count(query: Omit<InvoiceListQuery, 'limit' | 'offset'>): Promise<number> {
    const { actor } = query;

    if (readScope(actor, 'invoice') === 'none') return 0;

    const { rows } = await this.#client.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM billing.invoices i
       WHERE i.office_id = $1
         AND ($2::text IS NULL OR i.supply_period = $2)`,
      [actor.officeId, query.period ?? null],
    );

    return exactInteger('count', rows[0]!.count);
  }

  async save(invoice: Invoice, options?: { issuanceIdempotencyKey: string }): Promise<void> {
    await this.#upsertInvoice(invoice, undefined, options?.issuanceIdempotencyKey);
    await this.#replaceLines(invoice);
    await this.#replaceVatGroups(invoice);
  }

  async saveDraft(invoice: Invoice, craId: string): Promise<void> {
    try {
      await this.#upsertInvoice(invoice, [craId]);
    } catch (error: unknown) {
      if (isPgUniqueViolation(error, 'idx_invoices_source_cra_client')) {
        throw new CraAlreadyProcessedError(craId, invoice.billedTo.clientId);
      }
      throw error;
    }
    await this.#replaceLines(invoice);
    await this.#replaceVatGroups(invoice);
  }

  /** ADR-0021's "replay → original result": the documents the first validation drafted. */
  async findDraftedFrom(craId: string, actor: Actor): Promise<readonly InvoiceListItem[]> {
    if (readScope(actor, 'invoice') === 'none') return [];

    const { rows } = await this.#client.query<InvoiceListRow>(
      `${INVOICE_LIST_SELECT}
       WHERE $1 = ANY(i.source_cra_ids) AND i.office_id = $2
       ORDER BY i.billed_to_name`,
      [craId, actor.officeId],
    );

    return rows.map(toListItem);
  }

  /**
   * Idempotent by `(cra_id, mission_id, reason)`: a replayed validation writes the same rows and
   * appends nothing. `DO NOTHING` rather than `DO UPDATE`, because a decline is a fact about a
   * Cra that was validated once — there is nothing about it that can legitimately change.
   */
  async saveDeclinedDays(
    officeId: OfficeId,
    declined: readonly DeclinedDaysRecord[],
  ): Promise<void> {
    for (const record of declined) {
      await this.#client.query(
        `INSERT INTO billing.declined_days (id, cra_id, mission_id, quarter_days, reason, office_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (cra_id, mission_id, reason) DO NOTHING`,
        [
          this.#newId(),
          record.craId,
          record.missionId,
          record.quarterDays,
          record.reason,
          officeId,
        ],
      );
    }
  }

  async findDeclinedDays(
    craIds: readonly string[],
    actor: Actor,
  ): Promise<readonly DeclinedDaysRecord[]> {
    if (readScope(actor, 'invoice') === 'none') return [];

    const { rows } = await this.#client.query<DeclinedDaysRow>(
      // `= ANY($1)` rather than a built `IN (…)` list: an empty array matches nothing, where a
      // hand-assembled `IN ()` is a syntax error and the usual repair for it — dropping the
      // clause when the list is empty — returns the whole office.
      `SELECT cra_id, mission_id, quarter_days, reason
       FROM billing.declined_days
       WHERE cra_id = ANY($1) AND office_id = $2
       ORDER BY cra_id, mission_id`,
      [craIds, actor.officeId],
    );

    return rows.map((row) => ({
      craId: row.cra_id as CraId,
      missionId: row.mission_id as MissionId,
      quarterDays: exactInteger('quarter_days', row.quarter_days),
      reason: row.reason as DeclinedDaysRecord['reason'],
    }));
  }

  /** Rank A2: the dashboard's history chart — one row per (year, status), never a page to truncate. */
  async countByYearAndStatus(actor: Actor): Promise<readonly InvoiceYearStatusCount[]> {
    if (readScope(actor, 'invoice') === 'none') return [];

    const { rows } = await this.#client.query<{ year: string; status: string; count: string }>(
      `SELECT left(supply_period, 4) AS year, status, COUNT(*) AS count
       FROM billing.invoices
       WHERE office_id = $1
       GROUP BY left(supply_period, 4), status
       ORDER BY year, status`,
      [actor.officeId],
    );

    return rows.map((row) => ({
      year: row.year,
      status: row.status,
      count: exactInteger('count', row.count),
    }));
  }

  async hasCraBeenProcessed(craId: string): Promise<boolean> {
    const { rows } = await this.#client.query<{ found: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM billing.invoices WHERE $1 = ANY(source_cra_ids)
      ) AS found`,
      [craId],
    );
    return rows[0]!.found;
  }

  // `source_cra_ids` is deliberately absent from the ON CONFLICT SET list above. It is written by
  // the INSERT and never updated: `save` does not carry it, so `EXCLUDED.source_cra_ids` is `'{}'`
  // there, and updating the column would blank the provenance of every invoice at issuance —
  // taking `hasCraBeenProcessed` and the partial unique index of migration 006 with it.
  async findIssuedWithKey(key: string, actor: Actor): Promise<InvoiceListItem | null> {
    if (readScope(actor, 'invoice') === 'none') return null;

    const { rows } = await this.#client.query<InvoiceListRow>(
      `${INVOICE_LIST_SELECT}
       WHERE i.issuance_idempotency_key = $1 AND i.office_id = $2`,
      [key, actor.officeId],
    );
    const row = rows[0];

    return row === undefined ? null : toListItem(row);
  }

  async #upsertInvoice(
    invoice: Invoice,
    sourceCraIds?: readonly string[],
    issuanceIdempotencyKey?: string,
  ): Promise<void> {
    // Mirrors assertInvoiceStateIsCoherent (domain/invoice.ts): draft is the only status with
    // null totals. Gating on 'issued' instead of 'not draft' left cancelledByCreditNote rows
    // unreadable — they carry totals but were written with null ones.
    const totals = invoice.status === 'draft' ? null : invoice.totals;
    const mentions = invoice.mentions;

    await this.#client.query(
      `INSERT INTO billing.invoices (
        id, office_id, seller_id, status, supply_period,
        billed_to_client_id, billed_to_name, billed_to_siren, billed_to_vat_number,
        billed_to_billing_street, billed_to_billing_postal_code,
        billed_to_billing_city, billed_to_billing_country,
        billed_to_delivery_street, billed_to_delivery_postal_code,
        billed_to_delivery_city, billed_to_delivery_country,
        payment_terms_kind, payment_terms_days,
        mentions_operation_category, mentions_early_payment_kind, mentions_early_payment_rate,
        mentions_late_penalty_rate, mentions_recovery_indemnity, mentions_vat_on_debits,
        invoice_number, issue_date, series_entity_id, series_fiscal_year, due_date,
        total_ht_cents, total_tax_cents, total_ttc_cents,
        validated_by, source_cra_ids, issuance_idempotency_key
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19,
        $20, $21, $22, $23, $24, $25,
        $26, $27, $28, $29, $30,
        $31, $32, $33,
        $34, $35, $36
      ) ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        invoice_number = EXCLUDED.invoice_number,
        issue_date = EXCLUDED.issue_date,
        series_entity_id = EXCLUDED.series_entity_id,
        series_fiscal_year = EXCLUDED.series_fiscal_year,
        due_date = EXCLUDED.due_date,
        total_ht_cents = EXCLUDED.total_ht_cents,
        total_tax_cents = EXCLUDED.total_tax_cents,
        total_ttc_cents = EXCLUDED.total_ttc_cents,
        -- COALESCE, not EXCLUDED: a later re-save carries no key and must not erase the one the
        -- issuance wrote. source_cra_ids learned the same lesson in Phase 3, by being erased.
        issuance_idempotency_key = COALESCE(
          EXCLUDED.issuance_idempotency_key, billing.invoices.issuance_idempotency_key)`,
      [
        invoice.id,
        invoice.officeId,
        invoice.seller.id,
        invoice.status,
        invoice.supplyPeriod,
        invoice.billedTo.clientId,
        invoice.billedTo.name,
        invoice.billedTo.siren,
        invoice.billedTo.intraCommunityVatNumber,
        invoice.billedTo.billingAddress.line1,
        invoice.billedTo.billingAddress.postalCode,
        invoice.billedTo.billingAddress.city,
        invoice.billedTo.billingAddress.country,
        invoice.billedTo.deliveryAddress.line1,
        invoice.billedTo.deliveryAddress.postalCode,
        invoice.billedTo.deliveryAddress.city,
        invoice.billedTo.deliveryAddress.country,
        invoice.terms.kind,
        invoice.terms.days,
        mentions.operationCategory,
        mentions.earlyPaymentDiscount.kind,
        mentions.earlyPaymentDiscount.kind === 'rate'
          ? mentions.earlyPaymentDiscount.basisPoints
          : null,
        mentions.latePaymentBasisPoints,
        mentions.recoveryIndemnityCents,
        mentions.vatOnDebitsOption,
        invoice.number,
        invoice.issueDate,
        invoice.series?.entityId ?? null,
        invoice.series?.fiscalYear ?? null,
        invoice.issueDate !== null ? invoice.dueDateFrom(invoice.issueDate) : null,
        totals?.totalExcludingVatCents ?? null,
        totals?.vatTotalCents ?? null,
        totals?.totalIncludingVatCents ?? null,
        invoice.validatedBy,
        sourceCraIds ?? [],
        issuanceIdempotencyKey ?? null,
      ],
    );
  }

  async #replaceLines(invoice: Invoice): Promise<void> {
    await this.#client.query(`DELETE FROM billing.invoice_lines WHERE invoice_id = $1`, [
      invoice.id,
    ]);

    for (const [index, line] of invoice.lines.entries()) {
      await this.#client.query(
        `INSERT INTO billing.invoice_lines (
          id, invoice_id, line_order, designation,
          origin_kind, origin_mission_id, origin_cra_id, origin_period, origin_quarter_days, origin_tjm_cents,
          quantity_quarter_days, unit_price_cents, amount_cents,
          vat_kind, vat_basis_points, vat_not_charged_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          this.#newId(),
          invoice.id,
          index,
          line.designation,
          line.origin.kind,
          line.origin.missionId,
          line.origin.craId,
          line.origin.period,
          line.origin.quarterDays,
          line.origin.tjmCents,
          line.quantityQuarterDays,
          line.unitPriceCents,
          line.amountCents,
          line.vat.kind,
          line.vat.kind === 'taxable' ? line.vat.basisPoints : null,
          line.vat.kind === 'notCharged' ? line.vat.reason : null,
        ],
      );
    }
  }

  async #replaceVatGroups(invoice: Invoice): Promise<void> {
    await this.#client.query(`DELETE FROM billing.invoice_vat_groups WHERE invoice_id = $1`, [
      invoice.id,
    ]);

    for (const group of invoice.vatBreakdown) {
      await this.#client.query(
        `INSERT INTO billing.invoice_vat_groups (id, invoice_id, group_key, base_cents, tax_cents)
         VALUES ($1, $2, $3, $4, $5)`,
        [this.#newId(), invoice.id, group.key, group.baseCents, group.vatCents ?? 0],
      );
    }
  }

  async #reconstitute(row: InvoiceRow): Promise<Invoice> {
    const { rows: lineRows } = await this.#client.query<InvoiceLineRow>(
      `SELECT * FROM billing.invoice_lines WHERE invoice_id = $1 ORDER BY line_order`,
      [row.id],
    );

    const seller = await this.#loadSeller(row.seller_id);

    const lines: InvoiceLine[] = lineRows.map((lr) => ({
      designation: lr.designation,
      origin: this.#reconstructOrigin(lr),
      quantityQuarterDays: quarterDays(
        exactInteger('quantity_quarter_days', lr.quantity_quarter_days),
      ),
      unitPriceCents: exactInteger('unit_price_cents', lr.unit_price_cents),
      amountCents: exactInteger('amount_cents', lr.amount_cents),
      vat: this.#reconstructVat(lr),
    }));

    const billedTo: BilledParty = {
      clientId: row.billed_to_client_id as ClientId,
      name: row.billed_to_name,
      siren: row.billed_to_siren,
      intraCommunityVatNumber: row.billed_to_vat_number,
      billingAddress: {
        line1: row.billed_to_billing_street,
        line2: null,
        postalCode: row.billed_to_billing_postal_code,
        city: row.billed_to_billing_city,
        country: row.billed_to_billing_country,
      },
      deliveryAddress: {
        line1: row.billed_to_delivery_street,
        line2: null,
        postalCode: row.billed_to_delivery_postal_code,
        city: row.billed_to_delivery_city,
        country: row.billed_to_delivery_country,
      },
    };

    const terms: PaymentTerms = {
      kind: row.payment_terms_kind as 'net' | 'endOfMonth',
      days: row.payment_terms_days,
    };

    const earlyPaymentDiscount: EarlyPaymentDiscount =
      row.mentions_early_payment_kind === 'rate' && row.mentions_early_payment_rate !== null
        ? { kind: 'rate', basisPoints: row.mentions_early_payment_rate }
        : { kind: 'none' };

    const mentions: LegalMentions = {
      operationCategory: row.mentions_operation_category as OperationCategory,
      earlyPaymentDiscount,
      latePaymentBasisPoints: row.mentions_late_penalty_rate,
      recoveryIndemnityCents: exactInteger(
        'mentions_recovery_indemnity',
        row.mentions_recovery_indemnity,
      ),
      vatOnDebitsOption: row.mentions_vat_on_debits,
    };

    const series: SeriesKey | null =
      row.series_entity_id !== null && row.series_fiscal_year !== null
        ? { entityId: row.series_entity_id, fiscalYear: row.series_fiscal_year }
        : null;

    const totals: DocumentTotals | null =
      row.total_ht_cents !== null && row.total_tax_cents !== null && row.total_ttc_cents !== null
        ? {
            totalExcludingVatCents: exactInteger('total_ht_cents', row.total_ht_cents),
            vatTotalCents: exactInteger('total_tax_cents', row.total_tax_cents),
            totalIncludingVatCents: exactInteger('total_ttc_cents', row.total_ttc_cents),
          }
        : null;

    return Invoice.reconstitute({
      id: row.id as InvoiceId,
      officeId: row.office_id as OfficeId,
      status: row.status as InvoiceStatus,
      seller,
      billedTo,
      supplyPeriod: row.supply_period,
      lines,
      terms,
      mentions,
      validatedBy: (row.validated_by ?? []) as ConsultantId[],
      number: row.invoice_number,
      issueDate: row.issue_date === null ? null : isoDateOf(row.issue_date),
      series,
      totals,
    });
  }

  async #loadSeller(sellerId: string): Promise<LegalEntity> {
    const { rows } = await this.#client.query<LegalEntityRow>(
      `SELECT * FROM public.legal_entities WHERE id = $1`,
      [sellerId],
    );
    const row = rows[0];
    if (row === undefined) throw new ReferencedRowMissingError('public.legal_entities', sellerId);

    return {
      id: row.id,
      name: row.name,
      legalForm: row.legal_form,
      shareCapitalCents: exactInteger('share_capital_cents', row.share_capital_cents),
      siren: row.siren,
      intraCommunityVatNumber: row.intra_community_vat_number,
      rcsRegistration: row.rcs_registration,
      address: {
        line1: row.address_street,
        line2: null,
        postalCode: row.address_postal_code,
        city: row.address_city,
        country: row.address_country,
      },
      numberPrefix: row.number_prefix,
    };
  }

  #reconstructOrigin(lr: InvoiceLineRow): LineOrigin {
    return {
      kind: 'RegieDays',
      missionId: lr.origin_mission_id! as MissionId,
      craId: lr.origin_cra_id! as CraId,
      period: lr.origin_period!,
      quarterDays: quarterDays(lr.origin_quarter_days!),
      tjmCents: exactInteger('origin_tjm_cents', lr.origin_tjm_cents!),
    };
  }

  #reconstructVat(lr: InvoiceLineRow): VatTreatment {
    if (lr.vat_kind === 'taxable') {
      return { kind: 'taxable', basisPoints: lr.vat_basis_points! };
    }
    return {
      kind: 'notCharged',
      reason: lr.vat_not_charged_reason! as 'territoryOutsideVatScope' | 'reverseChargeEuB2b',
    };
  }
}

interface InvoiceRow {
  id: string;
  office_id: string;
  seller_id: string;
  status: string;
  supply_period: string;
  billed_to_client_id: string;
  billed_to_name: string;
  billed_to_siren: string | null;
  billed_to_vat_number: string | null;
  billed_to_billing_street: string;
  billed_to_billing_postal_code: string;
  billed_to_billing_city: string;
  billed_to_billing_country: string;
  billed_to_delivery_street: string;
  billed_to_delivery_postal_code: string;
  billed_to_delivery_city: string;
  billed_to_delivery_country: string;
  payment_terms_kind: string;
  payment_terms_days: number;
  mentions_operation_category: string;
  mentions_early_payment_kind: string;
  mentions_early_payment_rate: number | null;
  mentions_late_penalty_rate: number;
  mentions_recovery_indemnity: string | number;
  mentions_vat_on_debits: boolean;
  invoice_number: string | null;
  issue_date: string | null;
  series_entity_id: string | null;
  series_fiscal_year: number | null;
  due_date: string | null;
  total_ht_cents: string | number | null;
  total_tax_cents: string | number | null;
  total_ttc_cents: string | number | null;
  validated_by: string[] | null;
  source_cra_ids: string[] | null;
}

function toListItem(row: InvoiceListRow): InvoiceListItem {
  return {
    id: row.id as InvoiceId,
    status: row.status,
    supplyPeriod: row.supply_period,
    billedToName: row.billed_to_name,
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date === null ? null : isoDateOf(row.issue_date),
    totalTtcCents:
      row.total_ttc_cents !== null ? exactInteger('total_ttc_cents', row.total_ttc_cents) : null,
    totalsAreProvisional: row.status === 'draft',
  };
}

interface DeclinedDaysRow {
  cra_id: string;
  mission_id: string;
  quarter_days: string | number;
  reason: string;
}

interface InvoiceListRow {
  id: string;
  status: string;
  supply_period: string;
  billed_to_name: string;
  invoice_number: string | null;
  issue_date: Date | string | null;
  total_ttc_cents: string | number | null;
}

/**
 * Every list-shaped read joins two aggregated subqueries onto `billing.invoices` so a draft's
 * (still-null) `total_ttc_cents` reads as the sum of its lines instead of `NULL` — the same
 * computation `Invoice.totals` does in memory (domain/invoice.ts), reproduced here in integer SQL
 * because listing a page of invoices should not mean reconstituting every aggregate in it.
 * `COALESCE` prefers the frozen column: once issued, that is the number of record.
 */
const INVOICE_LIST_SELECT = `
  SELECT i.id, i.status, i.supply_period, i.billed_to_name, i.invoice_number, i.issue_date,
         COALESCE(i.total_ttc_cents, COALESCE(lt.ht_cents, 0) + COALESCE(vt.tax_cents, 0))
           AS total_ttc_cents
  FROM billing.invoices i
  LEFT JOIN (
    SELECT invoice_id, SUM(amount_cents) AS ht_cents
    FROM billing.invoice_lines
    GROUP BY invoice_id
  ) lt ON lt.invoice_id = i.id
  LEFT JOIN (
    SELECT invoice_id, SUM(tax_cents) AS tax_cents
    FROM billing.invoice_vat_groups
    GROUP BY invoice_id
  ) vt ON vt.invoice_id = i.id
`;

interface InvoiceLineRow {
  id: string;
  invoice_id: string;
  line_order: number;
  designation: string;
  origin_kind: string;
  origin_mission_id: string | null;
  origin_cra_id: string | null;
  origin_period: string | null;
  origin_quarter_days: number | null;
  origin_tjm_cents: string | number | null;
  quantity_quarter_days: string | number;
  unit_price_cents: string | number;
  amount_cents: string | number;
  vat_kind: string;
  vat_basis_points: number | null;
  vat_not_charged_reason: string | null;
}

interface LegalEntityRow {
  id: string;
  name: string;
  legal_form: string;
  share_capital_cents: string | number;
  siren: string;
  intra_community_vat_number: string;
  rcs_registration: string;
  address_street: string;
  address_postal_code: string;
  address_city: string;
  address_country: string;
  number_prefix: string;
}

function isPgUniqueViolation(error: unknown, constraintName: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code: unknown }).code === '23505' &&
    'constraint' in error &&
    (error as { constraint: unknown }).constraint === constraintName
  );
}
