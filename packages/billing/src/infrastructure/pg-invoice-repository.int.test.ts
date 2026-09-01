import { type Actor, quarterDays, OutOfScopeError, period } from '@erp/platform';
import { useTestTransaction } from '@erp/test-harness';
import { describe, expect, it } from 'vitest';

import { client } from '../domain/client.ts';
import { CraAlreadyProcessedError } from '../domain/errors.ts';
import { regieLine } from '../domain/invoice-line.ts';
import { billedParty, Invoice } from '../domain/invoice.ts';
import { legalMentions, RECOVERY_INDEMNITY_CENTS } from '../domain/mentions.ts';
import { paymentTerms } from '../domain/payment-terms.ts';
import { legalEntity } from '../domain/seller.ts';

import { PgInvoiceRepository } from './pg-invoice-repository.ts';

/**
 * Child-row ids for these tests. Not the production generator: the repositories take a factory
 * precisely so that the composition root chooses one (ADR-0041), and a test is a composition
 * root too. Counter-based so a failure names a readable id.
 */
let testIdCounter = 0;
const testIds = (): string => `test-id-${String(++testIdCounter)}`;

describe('PgInvoiceRepository', () => {
  const tx = useTestTransaction();

  const PARIS = 'office-paris';
  const LYON = 'office-lyon';

  // ADR-0023: an actor is a role inside an office. Billing and the manager both read the office's
  // invoices; a consultant reads none at all, whichever office they are in.
  const parisManager: Actor = { consultantId: 'manager-1', officeId: PARIS, role: 'manager' };
  const lyonManager: Actor = { consultantId: 'manager-2', officeId: LYON, role: 'manager' };
  const parisBilling: Actor = { consultantId: 'henri', officeId: PARIS, role: 'billing' };
  const parisConsultant: Actor = {
    consultantId: 'consultant-1',
    officeId: PARIS,
    role: 'consultant',
  };

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
    // **Not** the seed's `SEC`. `billing.invoices.invoice_number` is `TEXT UNIQUE` across the
    // whole table, and the harness rolls back what a test writes without isolating it from rows
    // that are already committed. A test that mints `SEC-2026-000001` therefore passes until
    // somebody walks the demo and issues the real one — which happened, during the review that
    // found this. A prefix no seed and no demo uses makes the collision impossible rather than
    // unlikely.
    numberPrefix: 'TST',
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

  const otherClient = client({
    id: 'client-energie',
    name: 'Énergie Sud SAS',
    siren: '443061841',
    territoriality: 'metropolitanFrance',
    billingAddress: {
      line1: '5 avenue de la République',
      line2: null,
      postalCode: '69002',
      city: 'Lyon',
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
      INSERT INTO public.clients (id, name, territoriality, billing_address_street, billing_address_postal_code, billing_address_city, billing_address_country)
      VALUES ('client-energie', 'Énergie Sud SAS', 'metropolitanFrance', '5 avenue de la République', '69002', 'Lyon', 'FR');
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
      VALUES ('entity-fr', 'Sécurité & Conseil', 'SAS', 15000000, '493296529', 'FR23493296529', 'RCS Paris 493 296 529', '12 rue de la Boétie', '75008', 'Paris', 'FR', 'TST');
    `);
  }

  function repo(): PgInvoiceRepository {
    return new PgInvoiceRepository(tx.client, testIds);
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
          quarterDays: quarterDays(84),
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
    const found = await repo().findById('invoice-1', parisManager);

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
    const found = await repo().findById('nonexistent', parisManager);
    expect(found).toBeNull();
  });

  it('refuses, rather than hides, an invoice of another office — ADR-0003 beat two', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().save(invoice);

    await expect(repo().findById('invoice-1', lyonManager)).rejects.toThrow(OutOfScopeError);
  });

  it('refuses a consultant every invoice, including one billing their own days', async () => {
    // The role dimension on a resource that has no subject: `consultant` is `none` here, so
    // office membership does not help.
    await seedReferenceData();
    await repo().save(makeDraftInvoice());

    await expect(repo().findById('invoice-1', parisConsultant)).rejects.toThrow(OutOfScopeError);
    expect(await repo().list({ actor: parisConsultant, limit: 10, offset: 0 })).toHaveLength(0);
  });

  it('lets billing read the invoices of its own office', async () => {
    await seedReferenceData();
    await repo().save(makeDraftInvoice());

    const found = await repo().findById('invoice-1', parisBilling);

    expect(found).not.toBeNull();
    expect(await repo().list({ actor: parisBilling, limit: 10, offset: 0 })).toHaveLength(1);
  });

  it('lists invoices filtered by office', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().save(invoice);

    const parisResults = await repo().list({ actor: parisManager, limit: 10, offset: 0 });
    expect(parisResults).toHaveLength(1);
    expect(parisResults[0]!.id).toBe('invoice-1');
    expect(parisResults[0]!.billedToName).toBe('Banque Nord SA');

    const lyonResults = await repo().list({ actor: lyonManager, limit: 10, offset: 0 });
    expect(lyonResults).toHaveLength(0);
  });

  it('caps pagination at MAX_PAGE_SIZE, however large the caller asks', async () => {
    // Seeded past the cap on purpose. Asking for 1000 against an empty table also returns "no
    // more than 50" and proves nothing — the cap has to be the reason the answer is short.
    await seedReferenceData();
    await tx.client.query(`
      INSERT INTO billing.invoices (
        id, office_id, seller_id, status, supply_period,
        billed_to_client_id, billed_to_name,
        billed_to_billing_street, billed_to_billing_postal_code,
        billed_to_billing_city, billed_to_billing_country,
        billed_to_delivery_street, billed_to_delivery_postal_code,
        billed_to_delivery_city, billed_to_delivery_country,
        payment_terms_kind, payment_terms_days,
        mentions_operation_category, mentions_early_payment_kind,
        mentions_late_penalty_rate, mentions_recovery_indemnity, mentions_vat_on_debits
      )
      SELECT 'invoice-bulk-' || g, 'office-paris', 'entity-fr', 'draft', '2026-03',
             'client-1', 'Client Test',
             '1 rue Test', '75001', 'Paris', 'France',
             '1 rue Test', '75001', 'Paris', 'France',
             'net', 30, 'services', 'none', 1000, 4000, false
      FROM generate_series(1, 60) AS g
    `);

    const capped = await repo().list({ actor: parisManager, limit: 1000, offset: 0 });
    expect(capped).toHaveLength(50);

    // And a caller under the cap still gets what it asked for, so the fix is not "always 50".
    const asked = await repo().list({ actor: parisManager, limit: 10, offset: 0 });
    expect(asked).toHaveLength(10);
  });

  it('list items do not expose Tjm, Cjm or margin', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().save(invoice);

    const items = await repo().list({ actor: parisManager, limit: 10, offset: 0 });
    const item = items[0]!;

    // Asserted as the WHOLE shape, not as four absent names. `tjm`, `cjm` and `margin` are
    // spellings this codebase never uses — a leak would arrive as `tjmCents` or `cjmCents` and
    // an absence test would stay green. A projection that grows a field fails here instead.
    expect(Object.keys(item).sort()).toStrictEqual([
      'billedToName',
      'id',
      'invoiceNumber',
      'issueDate',
      'status',
      'supplyPeriod',
      'totalTtcCents',
    ]);
  });

  it('saves and retrieves an issued invoice with frozen totals', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    invoice.issue({ by: 'claire', sequence: 42, issueDate: '2026-04-02' });

    await repo().save(invoice);
    const found = await repo().findById('invoice-1', parisManager);

    expect(found).not.toBeNull();
    expect(found!.status).toBe('issued');
    expect(found!.number).toBe('TST-2026-000042');
    expect(found!.issueDate).toBe('2026-04-02');
    expect(found!.series).toStrictEqual({ entityId: 'entity-fr', fiscalYear: 2026 });
    expect(found!.totals.totalExcludingVatCents).toBe(1_365_000);
    expect(found!.totals.vatTotalCents).toBe(273_000);
    expect(found!.totals.totalIncludingVatCents).toBe(1_638_000);
  });

  it('saves and retrieves a cancelledByCreditNote invoice — totals stay readable', async () => {
    // The regression this test exists for: #upsertInvoice gated totals on status === 'issued',
    // so a cancelledByCreditNote invoice — which keeps its totals per
    // assertInvoiceStateIsCoherent — was written with null ones and could never be read back.
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    invoice.issue({ by: 'claire', sequence: 43, issueDate: '2026-04-02' });
    await repo().save(invoice);

    invoice.cancelByCreditNote();
    await repo().save(invoice);

    const found = await repo().findById('invoice-1', parisManager);

    expect(found).not.toBeNull();
    expect(found!.status).toBe('cancelledByCreditNote');
    expect(found!.number).toBe('TST-2026-000043');
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

  it('keeps the source CRA id when the invoice is issued', async () => {
    // The regression this test exists for. `save` carries no source ids, so `EXCLUDED
    // .source_cra_ids` is `'{}'` on its upsert; updating the column there blanked the provenance
    // of every invoice at the moment it was issued — which is the moment it becomes permanent.
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().saveDraft(invoice, 'cra-1');

    invoice.issue({ by: 'claire', sequence: 7, issueDate: '2026-04-02' });
    await repo().save(invoice);

    const { rows } = await tx.client.query<{ source_cra_ids: string[] }>(
      `SELECT source_cra_ids FROM billing.invoices WHERE id = $1`,
      ['invoice-1'],
    );
    expect(rows[0]!.source_cra_ids).toStrictEqual(['cra-1']);
  });

  it('still reports a CRA as processed after its invoice is issued', async () => {
    // The consequence of the line above, stated as the invariant rather than as the column:
    // the idempotency guard has to survive issuance, or a replayed event drafts a duplicate of a
    // document that has already left.
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().saveDraft(invoice, 'cra-1');
    invoice.issue({ by: 'claire', sequence: 8, issueDate: '2026-04-02' });
    await repo().save(invoice);

    expect(await repo().hasCraBeenProcessed('cra-1')).toBe(true);
  });

  it('refuses a second draft from the same CRA after the first was issued', async () => {
    // And the database half of the same invariant: the partial unique index of migration 006 is
    // `WHERE source_cra_ids <> '{}'`, so blanking the column also removed the row from the index.
    await seedReferenceData();

    const first = makeDraftInvoice();
    await repo().saveDraft(first, 'cra-1');
    first.issue({ by: 'claire', sequence: 9, issueDate: '2026-04-02' });
    await repo().save(first);

    const replay = makeDraftInvoice('invoice-2');

    await expect(repo().saveDraft(replay, 'cra-1')).rejects.toThrow(CraAlreadyProcessedError);
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

    const found1 = await repo().findById('invoice-1', parisManager);
    expect(found1!.status).toBe('draft');

    invoice.issue({ by: 'claire', sequence: 1, issueDate: '2026-04-02' });
    await repo().save(invoice);

    const found2 = await repo().findById('invoice-1', parisManager);
    expect(found2!.status).toBe('issued');
    expect(found2!.number).toBe('TST-2026-000001');
  });

  it('round-trips the seller through the legal_entities table', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().save(invoice);
    const found = await repo().findById('invoice-1', parisManager);

    expect(found!.seller.name).toBe('Sécurité & Conseil');
    expect(found!.seller.siren).toBe('493296529');
    expect(found!.seller.numberPrefix).toBe('TST');
    expect(found!.seller.shareCapitalCents).toBe(15_000_000);
  });

  // ---------------------------------------------------------------------------
  // Idempotency — ADR-0021
  // ---------------------------------------------------------------------------

  it('hasCraBeenProcessed returns false for a CRA with no invoice', async () => {
    await seedReferenceData();
    expect(await repo().hasCraBeenProcessed('cra-never-seen')).toBe(false);
  });

  it('hasCraBeenProcessed returns true after saveDraft', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice();
    await repo().saveDraft(invoice, 'cra-1');
    expect(await repo().hasCraBeenProcessed('cra-1')).toBe(true);
  });

  it('saveDraft throws CraAlreadyProcessedError on duplicate CRA + same client', async () => {
    await seedReferenceData();

    const first = makeDraftInvoice('invoice-first');
    await repo().saveDraft(first, 'cra-dup');

    // A replayed event drafts a new invoice (fresh id) for the same CRA and client.
    const replay = makeDraftInvoice('invoice-replay');

    // The savepoint lets us assert the rejection without aborting the harness transaction.
    await tx.client.query('SAVEPOINT before_replay');
    await expect(repo().saveDraft(replay, 'cra-dup')).rejects.toThrow(CraAlreadyProcessedError);
    await tx.client.query('ROLLBACK TO SAVEPOINT before_replay');
  });

  it('same CRA, different clients — both succeed (ADR-0038)', async () => {
    await seedReferenceData();

    const forBanque = makeDraftInvoice('invoice-banque');
    await repo().saveDraft(forBanque, 'cra-multi');

    const forEnergie = Invoice.draft({
      id: 'invoice-energie',
      officeId: PARIS,
      seller: SELLER,
      billedTo: billedParty(otherClient),
      supplyPeriod: period(2026, 3),
      lines: [
        regieLine({
          designation: 'Prestation de conseil — mars 2026',
          missionId: 'mission-audit',
          craId: 'cra-multi',
          period: '2026-03',
          quarterDays: quarterDays(40),
          tjmCents: 55_000,
          vat: { kind: 'taxable', basisPoints: 2000 },
        }),
      ],
      terms: TERMS,
      mentions: MENTIONS,
      validatedBy: ['bruno'],
    });

    await expect(repo().saveDraft(forEnergie, 'cra-multi')).resolves.toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // The four reads and writes Phase 5 added — ADR-0021, ADR-0037, ADR-0044
  //
  // Each gets a positive and a negative test, per `docs/BUILD-RULES.md` § Working discipline.
  // Three of the four are office-scoped, and it is the refusal that carries the claim: for
  // `findIssuedWithKey` ADR-0044 states it as security — an actor who may not read the invoice
  // must not learn from the replay lookup whether their key was used on one.
  // ---------------------------------------------------------------------------

  it('findDraftedFrom answers the documents a validation drafted', async () => {
    await seedReferenceData();

    await repo().saveDraft(makeDraftInvoice('invoice-drafted'), 'cra-drafted');
    const drafted = await repo().findDraftedFrom('cra-drafted', parisManager);

    expect(drafted).toHaveLength(1);
    expect(drafted[0]!.id).toBe('invoice-drafted');
    expect(drafted[0]!.status).toBe('draft');
  });

  it('findDraftedFrom answers nothing for another office, and nothing for a consultant', async () => {
    await seedReferenceData();

    await repo().saveDraft(makeDraftInvoice('invoice-drafted'), 'cra-drafted');

    expect(await repo().findDraftedFrom('cra-drafted', lyonManager)).toStrictEqual([]);
    expect(await repo().findDraftedFrom('cra-drafted', parisConsultant)).toStrictEqual([]);
    // And the Cra that drafted nothing is the same empty answer as the one out of reach, which is
    // beat one of ADR-0003: an absence says nothing about why.
    expect(await repo().findDraftedFrom('cra-never-validated', parisManager)).toStrictEqual([]);
  });

  it('saveDeclinedDays writes the days that produced no line, and findDeclinedDays reads them back', async () => {
    await seedReferenceData();

    await repo().saveDeclinedDays(PARIS, [
      { craId: 'cra-1', missionId: 'mission-forfait', quarterDays: 12, reason: 'notRegie' },
      { craId: 'cra-1', missionId: 'mission-ghost', quarterDays: 4, reason: 'unknownMission' },
    ]);

    const declined = await repo().findDeclinedDays(['cra-1'], parisManager);

    expect(declined).toStrictEqual([
      { craId: 'cra-1', missionId: 'mission-forfait', quarterDays: 12, reason: 'notRegie' },
      { craId: 'cra-1', missionId: 'mission-ghost', quarterDays: 4, reason: 'unknownMission' },
    ]);
  });

  it('saveDeclinedDays appends nothing on a replay — the claim migration 009 makes', async () => {
    // `ON CONFLICT (cra_id, mission_id, reason) DO NOTHING`. ADR-0021's replay runs the whole
    // subscriber again, so this write happens twice for one validation and must leave one row.
    await seedReferenceData();

    await repo().saveDeclinedDays(PARIS, [
      { craId: 'cra-1', missionId: 'mission-forfait', quarterDays: 12, reason: 'notRegie' },
    ]);
    // The replay does not throw — the unique index alone would make it throw — and it does not
    // overwrite either: `DO NOTHING` rather than `DO UPDATE`, because a decline is a fact about a
    // Cra that was validated once, and there is nothing about it that can legitimately change.
    await repo().saveDeclinedDays(PARIS, [
      { craId: 'cra-1', missionId: 'mission-forfait', quarterDays: 1998, reason: 'notRegie' },
    ]);

    const declined = await repo().findDeclinedDays(['cra-1'], parisManager);

    expect(declined).toHaveLength(1);
    expect(declined[0]!.quarterDays).toBe(12);
  });

  it('findDeclinedDays answers nothing for another office, and nothing for a consultant', async () => {
    await seedReferenceData();

    await repo().saveDeclinedDays(PARIS, [
      { craId: 'cra-1', missionId: 'mission-forfait', quarterDays: 12, reason: 'notRegie' },
    ]);

    expect(await repo().findDeclinedDays(['cra-1'], lyonManager)).toStrictEqual([]);
    expect(await repo().findDeclinedDays(['cra-1'], parisConsultant)).toStrictEqual([]);
  });

  // ── The pré-facturier's reads (ADR-0053) ──────────────────────────────────

  it('findDeclinedDays answers for several Cras at once, each row naming its own', async () => {
    // The shape ADR-0053 chose over a `supply_period` column on `billing.declined_days`: the
    // composition root asks `timesheet` which Cras the month has and hands the ids over, so
    // `billing` never learns what a period is and the screen still costs one query.
    await seedReferenceData();

    await repo().saveDeclinedDays(PARIS, [
      { craId: 'cra-1', missionId: 'mission-forfait', quarterDays: 12, reason: 'notRegie' },
      { craId: 'cra-2', missionId: 'mission-ghost', quarterDays: 4, reason: 'unknownMission' },
    ]);

    const declined = await repo().findDeclinedDays(['cra-1', 'cra-2'], parisManager);

    expect(declined.map((row) => [row.craId, row.quarterDays])).toStrictEqual([
      ['cra-1', 12],
      ['cra-2', 4],
    ]);
  });

  it('findDeclinedDays given no Cra answers nothing, rather than everything', async () => {
    // The failure mode an `IN` list has when the caller passes an empty month: a query that
    // degenerates into "no filter" returns the whole office. `= ANY('{}')` matches nothing, and
    // this is the test that keeps it that way.
    await seedReferenceData();

    await repo().saveDeclinedDays(PARIS, [
      { craId: 'cra-1', missionId: 'mission-forfait', quarterDays: 12, reason: 'notRegie' },
    ]);

    expect(await repo().findDeclinedDays([], parisManager)).toStrictEqual([]);
  });

  it('list narrows to one supply period when asked, and to every period when not', async () => {
    await seedReferenceData();

    await repo().saveDraft(makeDraftInvoice('invoice-march'), 'cra-march');
    const april = Invoice.draft({
      id: 'invoice-april',
      officeId: PARIS,
      seller: SELLER,
      billedTo: billedParty(parisClient),
      supplyPeriod: period(2026, 4),
      lines: [
        regieLine({
          designation: 'Prestation de conseil — avril 2026',
          missionId: 'mission-audit',
          craId: 'cra-april',
          period: '2026-04',
          quarterDays: quarterDays(4),
          tjmCents: 60_000,
          vat: { kind: 'taxable', basisPoints: 2000 },
        }),
      ],
      terms: TERMS,
      mentions: MENTIONS,
      validatedBy: ['bruno'],
    });
    await repo().saveDraft(april, 'cra-april');

    const march = await repo().list({
      actor: parisManager,
      limit: 10,
      offset: 0,
      period: '2026-03',
    });
    expect(march.map((row) => row.id)).toStrictEqual(['invoice-march']);

    // The filter is pushed into the query rather than applied to a capped page (ADR-0053), so
    // asking for a month with nothing in it is an empty answer and not a short one.
    const may = await repo().list({ actor: parisManager, limit: 10, offset: 0, period: '2026-05' });
    expect(may).toStrictEqual([]);

    const every = await repo().list({ actor: parisManager, limit: 10, offset: 0 });
    expect(every).toHaveLength(2);
  });

  it('findIssuedWithKey answers the document the key issued', async () => {
    await seedReferenceData();

    const invoice = makeDraftInvoice('invoice-keyed');
    invoice.issue({ by: 'claire', sequence: 11, issueDate: '2026-04-02' });
    await repo().save(invoice, { issuanceIdempotencyKey: 'key-abcdefgh' });

    const found = await repo().findIssuedWithKey('key-abcdefgh', parisBilling);

    expect(found).not.toBeNull();
    expect(found!.id).toBe('invoice-keyed');
    expect(found!.invoiceNumber).toBe('TST-2026-000011');
  });

  it('findIssuedWithKey tells an actor out of scope nothing — the ADR-0044 security claim', async () => {
    // Not "answers null because there is no row": the row is there, and the answer must be the
    // same one an unused key gets. A caller who may not read the invoice cannot use this route to
    // discover that their key issued one.
    await seedReferenceData();

    const invoice = makeDraftInvoice('invoice-keyed');
    invoice.issue({ by: 'claire', sequence: 12, issueDate: '2026-04-02' });
    await repo().save(invoice, { issuanceIdempotencyKey: 'key-abcdefgh' });

    expect(await repo().findIssuedWithKey('key-abcdefgh', lyonManager)).toBeNull();
    expect(await repo().findIssuedWithKey('key-abcdefgh', parisConsultant)).toBeNull();
    expect(await repo().findIssuedWithKey('key-never-used', parisBilling)).toBeNull();
  });
});
