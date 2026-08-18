import { halfDays, period } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { useTestTransaction } from '../../../../tests/harness/rollback.ts';
import { client } from '../domain/client.ts';
import { regieLine } from '../domain/invoice-line.ts';
import { billedParty, Invoice } from '../domain/invoice.ts';
import { legalMentions, RECOVERY_INDEMNITY_CENTS } from '../domain/mentions.ts';
import { paymentTerms } from '../domain/payment-terms.ts';
import { legalEntity } from '../domain/seller.ts';

import { PgInvoiceRepository } from './pg-invoice-repository.ts';

describe('PgInvoiceRepository', () => {
  const tx = useTestTransaction();

  const PARIS = 'office-paris';
  const LYON = 'office-lyon';

  const SELLER = legalEntity({
    id: 'entity-fr',
    name: 'Sécurité & Conseil',
    legalForm: 'SAS',
    shareCapitalCents: 15_000_000,
    siren: '493296529',
    intraCommunityVatNumber: 'FR23493296529',
    rcsRegistration: 'RCS Paris 493 296 529',
    address: {
      line1: '12 rue de la Boétie',
      line2: null,
      postalCode: '75008',
      city: 'Paris',
      country: 'FR',
    },
    numberPrefix: 'SEC',
  });

  const TERMS = paymentTerms({ kind: 'net', days: 30 });

  const MENTIONS = legalMentions({
    latePaymentBasisPoints: 3000,
    recoveryIndemnityCents: RECOVERY_INDEMNITY_CENTS,
    earlyPaymentDiscount: { kind: 'none' },
    operationCategory: 'services',
    vatOnDebitsOption: true,
  });

  const parisClient = client({
    id: 'client-banque',
    name: 'Banque Nord SA',
    siren: '552100554',
    territoriality: 'metropolitanFrance',
    billingAddress: {
      line1: '12 rue de la Boétie',
      line2: null,
      postalCode: '75008',
      city: 'Paris',
      country: 'FR',
    },
  });

  async function seedReferenceData(): Promise<void> {
    await tx.client.query(`
      INSERT INTO public.offices (id, name, city) VALUES ('office-paris', 'Paris', 'Paris');
      INSERT INTO public.offices (id, name, city) VALUES ('office-lyon', 'Lyon', 'Lyon');
    `);
    await tx.client.query(`
      INSERT INTO public.practices (id, name) VALUES ('practice-audit', 'Audit');
    `);
    await tx.client.query(`
      INSERT INTO public.clients (id, name, territoriality, billing_address_street, billing_address_postal_code, billing_address_city, billing_address_country)
      VALUES ('client-banque', 'Banque Nord SA', 'metropolitanFrance', '12 rue de la Boétie', '75008', 'Paris', 'FR');
    `);
    await tx.client.query(`
      INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
      VALUES ('consultant-1', 'Alice', 'Dupont', 'alice@test.com', 'office-paris', 'practice-audit', 'consultant');
    `);
    await tx.client.query(`
      INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
      VALUES ('mission-audit', 'client-banque', 'Mission Audit PASSI', 'Regie', '2026-01-01');
    `);
    await tx.client.query(`
      INSERT INTO public.legal_entities (id, name, legal_form, share_capital_cents, siren, intra_community_vat_number, rcs_registration, address_street, address_postal_code, address_city, address_country, number_prefix)
      VALUES ('entity-fr', 'Sécurité & Conseil', 'SAS', 15000000, '493296529', 'FR23493296529', 'RCS Paris 493 296 529', '12 rue de la Boétie', '75008', 'Paris', 'FR', 'SEC');
    `);
  }

  function repo(): PgInvoiceRepository {
    return new PgInvoiceRepository(tx.client);
  }

  function makeDraftInvoice(id = 'invoice-1', officeId = PARIS): Invoice {
    return Invoice.draft({
      id,
      officeId,
      seller: SELLER,
      billedTo: billedParty(parisClient),
      supplyPeriod: period(2026, 3),
      lines: [
        regieLine({
          designation: 'Prestation de conseil — mars 2026',
          missionId: 'mission-audit',
          craId: 'cra-1',
          period: '2026-03',
          halfDays: halfDays(42),
          tjmCents: 65_000,
          vat: { kind: 'taxable', basisPoints: 2000 },
        }),
      ],
      terms: TERMS,
      mentions: MENTIONS,
      validatedBy: ['bruno'],
    });
  }

  it('saves and retrieves a draft invoice', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().save(invoice);
    const found = await repo().findById('invoice-1', { officeId: PARIS });

    expect(found).not.toBeNull();
    expect(found!.id).toBe('invoice-1');
    expect(found!.status).toBe('draft');
    expect(found!.officeId).toBe(PARIS);
    expect(found!.billedTo.name).toBe('Banque Nord SA');
    expect(found!.billedTo.siren).toBe('552100554');
    expect(found!.supplyPeriod).toBe('2026-03');
    expect(found!.lines).toHaveLength(1);
    expect(found!.lines[0]!.designation).toBe('Prestation de conseil — mars 2026');
    expect(found!.lines[0]!.amountCents).toBe(1_365_000);
    expect(found!.lines[0]!.origin.kind).toBe('RegieDays');
    expect(found!.lines[0]!.origin.tjmCents).toBe(65_000);
    expect(found!.terms).toStrictEqual({ kind: 'net', days: 30 });
    expect(found!.mentions.vatOnDebitsOption).toBe(true);
  });

  it('returns null when invoice does not exist', async () => {
    await seedReferenceData();
    const found = await repo().findById('nonexistent', { officeId: PARIS });
    expect(found).toBeNull();
  });

  it('returns null when actor office does not match — authorization scope', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().save(invoice);

    const found = await repo().findById('invoice-1', { officeId: LYON });
    expect(found).toBeNull();
  });

  it('lists invoices filtered by office', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().save(invoice);

    const parisResults = await repo().list({ officeId: PARIS, limit: 10, offset: 0 });
    expect(parisResults).toHaveLength(1);
    expect(parisResults[0]!.id).toBe('invoice-1');
    expect(parisResults[0]!.billedToName).toBe('Banque Nord SA');

    const lyonResults = await repo().list({ officeId: LYON, limit: 10, offset: 0 });
    expect(lyonResults).toHaveLength(0);
  });

  it('caps pagination at MAX_PAGE_SIZE', async () => {
    await seedReferenceData();
    const results = await repo().list({ officeId: PARIS, limit: 1000, offset: 0 });
    expect(results).toHaveLength(0);
  });

  it('list items do not expose Tjm, Cjm or margin', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().save(invoice);

    const items = await repo().list({ officeId: PARIS, limit: 10, offset: 0 });
    const item = items[0]!;
    const keys = Object.keys(item);
    expect(keys).not.toContain('tjm');
    expect(keys).not.toContain('cjm');
    expect(keys).not.toContain('margin');
    expect(keys).not.toContain('lines');
  });

  it('saves and retrieves an issued invoice with frozen totals', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    invoice.issue({ by: 'claire', sequence: 42, issueDate: '2026-04-02' });

    await repo().save(invoice);
    const found = await repo().findById('invoice-1', { officeId: PARIS });

    expect(found).not.toBeNull();
    expect(found!.status).toBe('issued');
    expect(found!.number).toBe('SEC-2026-000042');
    expect(found!.issueDate).toBe('2026-04-02');
    expect(found!.series).toStrictEqual({ entityId: 'entity-fr', fiscalYear: 2026 });
    expect(found!.totals.totalExcludingVatCents).toBe(1_365_000);
    expect(found!.totals.vatTotalCents).toBe(273_000);
    expect(found!.totals.totalIncludingVatCents).toBe(1_638_000);
  });

  it('saveDraft records the source CRA id', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().saveDraft(invoice, 'cra-1');

    const { rows } = await tx.client.query<{ source_cra_ids: string[] }>(
      `SELECT source_cra_ids FROM billing.invoices WHERE id = $1`,
      ['invoice-1'],
    );
    expect(rows[0]!.source_cra_ids).toStrictEqual(['cra-1']);
  });

  it('persists the VAT breakdown alongside the invoice', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().save(invoice);

    const { rows } = await tx.client.query<{
      group_key: string;
      base_cents: string;
      tax_cents: string;
    }>(
      `SELECT group_key, base_cents, tax_cents FROM billing.invoice_vat_groups WHERE invoice_id = $1`,
      ['invoice-1'],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.group_key).toBe('taxable:2000');
    expect(Number.parseInt(rows[0]!.base_cents, 10)).toBe(1_365_000);
    expect(Number.parseInt(rows[0]!.tax_cents, 10)).toBe(273_000);
  });

  it('updates status on re-save (upsert)', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().save(invoice);

    const found1 = await repo().findById('invoice-1', { officeId: PARIS });
    expect(found1!.status).toBe('draft');

    invoice.issue({ by: 'claire', sequence: 1, issueDate: '2026-04-02' });
    await repo().save(invoice);

    const found2 = await repo().findById('invoice-1', { officeId: PARIS });
    expect(found2!.status).toBe('issued');
    expect(found2!.number).toBe('SEC-2026-000001');
  });

  it('round-trips the seller through the legal_entities table', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().save(invoice);
    const found = await repo().findById('invoice-1', { officeId: PARIS });

    expect(found!.seller.name).toBe('Sécurité & Conseil');
    expect(found!.seller.siren).toBe('493296529');
    expect(found!.seller.numberPrefix).toBe('SEC');
    expect(found!.seller.shareCapitalCents).toBe(15_000_000);
  });
});
