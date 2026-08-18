import { type IsoDate, halfDays } from '@erp/platform';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- pg is in dependencies; @types/pg is a devDependency because types are compile-time
import pg from 'pg';

pg.types.setTypeParser(1082, (val: string) => val);

import type { DocumentTotals } from '../domain/document.ts';
import type { ConsultantId, CraId, InvoiceId, MissionId, OfficeId } from '../domain/ids.ts';
import type { InvoiceLine, LineOrigin } from '../domain/invoice-line.ts';
import type {
  InvoiceListItem,
  InvoiceListQuery,
  InvoiceRepository,
} from '../domain/invoice-repository.ts';
import type { InvoiceStatus } from '../domain/invoice-status.ts';
import { type BilledParty, Invoice } from '../domain/invoice.ts';
import type { EarlyPaymentDiscount, LegalMentions, OperationCategory } from '../domain/mentions.ts';
import type { SeriesKey } from '../domain/numbering.ts';
import type { PaymentTerms } from '../domain/payment-terms.ts';
import type { LegalEntity } from '../domain/seller.ts';
import type { VatTreatment } from '../domain/vat.ts';

const MAX_PAGE_SIZE = 50;

interface PgClient {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export class PgInvoiceRepository implements InvoiceRepository {
  readonly #client: PgClient;

  constructor(client: PgClient) {
    this.#client = client;
  }

  async findById(id: InvoiceId, actor: { officeId: OfficeId }): Promise<Invoice | null> {
    const { rows } = await this.#client.query<InvoiceRow>(
      `SELECT * FROM billing.invoices WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) return null;
    const row = rows[0]!;
    if (row.office_id !== actor.officeId) return null;

    return this.#reconstitute(row);
  }

  async list(query: InvoiceListQuery): Promise<readonly InvoiceListItem[]> {
    const limit = Math.min(query.limit, MAX_PAGE_SIZE);

    const { rows } = await this.#client.query<InvoiceListRow>(
      `SELECT id, status, supply_period, billed_to_name, invoice_number, issue_date, total_ttc_cents
       FROM billing.invoices
       WHERE office_id = $1
       ORDER BY supply_period DESC, billed_to_name
       LIMIT $2 OFFSET $3`,
      [query.officeId, limit, query.offset],
    );

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      supplyPeriod: row.supply_period,
      billedToName: row.billed_to_name,
      invoiceNumber: row.invoice_number,
      issueDate: row.issue_date,
      totalTtcCents: row.total_ttc_cents !== null ? Number(row.total_ttc_cents) : null,
    }));
  }

  async save(invoice: Invoice): Promise<void> {
    await this.#upsertInvoice(invoice);
    await this.#replaceLines(invoice);
    await this.#replaceVatGroups(invoice);
  }

  async saveDraft(invoice: Invoice, craId: string): Promise<void> {
    await this.#upsertInvoice(invoice, [craId]);
    await this.#replaceLines(invoice);
    await this.#replaceVatGroups(invoice);
  }

  async #upsertInvoice(invoice: Invoice, sourceCraIds?: readonly string[]): Promise<void> {
    const totals = invoice.status === 'issued' ? invoice.totals : null;
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
        validated_by, source_cra_ids
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19,
        $20, $21, $22, $23, $24, $25,
        $26, $27, $28, $29, $30,
        $31, $32, $33,
        $34, $35
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
        source_cra_ids = EXCLUDED.source_cra_ids`,
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
          origin_kind, origin_mission_id, origin_cra_id, origin_period, origin_half_days, origin_tjm_cents,
          quantity_half_days, unit_price_cents, amount_cents,
          vat_kind, vat_basis_points, vat_not_charged_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          `${invoice.id}-line-${String(index)}`,
          invoice.id,
          index,
          line.designation,
          line.origin.kind,
          line.origin.missionId,
          line.origin.craId,
          line.origin.period,
          line.origin.halfDays,
          line.origin.tjmCents,
          line.quantityHalfDays,
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

    for (const [index, group] of invoice.vatBreakdown.entries()) {
      await this.#client.query(
        `INSERT INTO billing.invoice_vat_groups (id, invoice_id, group_key, base_cents, tax_cents)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          `${invoice.id}-vat-${String(index)}`,
          invoice.id,
          group.key,
          group.baseCents,
          group.vatCents ?? 0,
        ],
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
      quantityHalfDays: halfDays(Number(lr.quantity_half_days)),
      unitPriceCents: Number(lr.unit_price_cents),
      amountCents: Number(lr.amount_cents),
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
      recoveryIndemnityCents: Number(row.mentions_recovery_indemnity),
      vatOnDebitsOption: row.mentions_vat_on_debits,
    };

    const series: SeriesKey | null =
      row.series_entity_id !== null && row.series_fiscal_year !== null
        ? { entityId: row.series_entity_id, fiscalYear: row.series_fiscal_year }
        : null;

    const totals: DocumentTotals | null =
      row.total_ht_cents !== null && row.total_tax_cents !== null && row.total_ttc_cents !== null
        ? {
            totalExcludingVatCents: Number(row.total_ht_cents),
            vatTotalCents: Number(row.total_tax_cents),
            totalIncludingVatCents: Number(row.total_ttc_cents),
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
      issueDate: (row.issue_date ?? null) as IsoDate | null,
      series,
      totals,
    });
  }

  async #loadSeller(sellerId: string): Promise<LegalEntity> {
    const { rows } = await this.#client.query<LegalEntityRow>(
      `SELECT * FROM public.legal_entities WHERE id = $1`,
      [sellerId],
    );
    const row = rows[0]!;

    return {
      id: row.id,
      name: row.name,
      legalForm: row.legal_form,
      shareCapitalCents: Number(row.share_capital_cents),
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
      halfDays: halfDays(lr.origin_half_days!),
      tjmCents: Number(lr.origin_tjm_cents!),
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

interface InvoiceListRow {
  id: string;
  status: string;
  supply_period: string;
  billed_to_name: string;
  invoice_number: string | null;
  issue_date: string | null;
  total_ttc_cents: string | number | null;
}

interface InvoiceLineRow {
  id: string;
  invoice_id: string;
  line_order: number;
  designation: string;
  origin_kind: string;
  origin_mission_id: string | null;
  origin_cra_id: string | null;
  origin_period: string | null;
  origin_half_days: number | null;
  origin_tjm_cents: string | number | null;
  quantity_half_days: string | number;
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
