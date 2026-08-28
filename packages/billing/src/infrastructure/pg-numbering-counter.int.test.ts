import { quarterDays, period } from '@erp/platform';
import { closePool, getPool, useTestTransaction } from '@erp/test-harness';
import { afterAll, describe, expect, it } from 'vitest';

import { client } from '../domain/client.ts';
import { regieLine } from '../domain/invoice-line.ts';
import { billedParty, Invoice } from '../domain/invoice.ts';
import { legalMentions, RECOVERY_INDEMNITY_CENTS } from '../domain/mentions.ts';
import { paymentTerms } from '../domain/payment-terms.ts';
import { legalEntity } from '../domain/seller.ts';

import { PgInvoiceRepository } from './pg-invoice-repository.ts';
import { PgNumberingCounter } from './pg-numbering-counter.ts';

// ---------------------------------------------------------------------------
// Simple sequential tests — the per-test rollback harness is enough.
// ---------------------------------------------------------------------------

/**
 * Child-row ids for these tests. Not the production generator: the repositories take a factory
 * precisely so that the composition root chooses one (ADR-0041), and a test is a composition
 * root too. Counter-based so a failure names a readable id.
 */
let testIdCounter = 0;
const testIds = (): string => `test-id-${String(++testIdCounter)}`;

describe('PgNumberingCounter', () => {
  const tx = useTestTransaction();

  it('first allocation returns 1', async () => {
    const counter = new PgNumberingCounter(tx.client);
    const seq = await counter.nextSequence('entity-a', 2026);
    expect(seq).toBe(1);
  });

  it('sequential allocations return consecutive numbers', async () => {
    const counter = new PgNumberingCounter(tx.client);
    const first = await counter.nextSequence('entity-a', 2026);
    const second = await counter.nextSequence('entity-a', 2026);
    const third = await counter.nextSequence('entity-a', 2026);
    expect([first, second, third]).toStrictEqual([1, 2, 3]);
  });

  it('separate series are independent', async () => {
    const counter = new PgNumberingCounter(tx.client);
    const a1 = await counter.nextSequence('entity-a', 2026);
    const b1 = await counter.nextSequence('entity-b', 2026);
    const a2 = await counter.nextSequence('entity-a', 2026);
    expect([a1, b1, a2]).toStrictEqual([1, 1, 2]);
  });

  it('separate fiscal years are independent', async () => {
    const counter = new PgNumberingCounter(tx.client);
    const y26 = await counter.nextSequence('entity-a', 2026);
    const y27 = await counter.nextSequence('entity-a', 2027);
    expect([y26, y27]).toStrictEqual([1, 1]);
  });
});

// ---------------------------------------------------------------------------
// Transactional guarantees — these need real pool clients, not the harness.
//
// `useTestTransaction` wraps each test in one `BEGIN`/`ROLLBACK`. That single
// client cannot demonstrate concurrency (FOR UPDATE is a no-op against your
// own lock) or rollback resilience (the harness rolls back for you).
// ---------------------------------------------------------------------------

describe('PgNumberingCounter — transactional guarantees', () => {
  afterAll(async () => {
    await closePool();
  });

  async function cleanupSeries(...entityIds: string[]): Promise<void> {
    const pool = getPool();
    const c = await pool.connect();
    try {
      for (const id of entityIds) {
        await c.query(`DELETE FROM billing.numbering_series WHERE entity_id = $1`, [id]);
      }
    } finally {
      c.release();
    }
  }

  it('a rolled-back allocation leaves no gap — the same number is reissued', async () => {
    const pool = getPool();
    const clientA = await pool.connect();
    const clientB = await pool.connect();

    try {
      // A allocates and rolls back.
      await clientA.query('BEGIN');
      const seqA = await new PgNumberingCounter(clientA).nextSequence('test-rollback', 2026);
      expect(seqA).toBe(1);
      await clientA.query('ROLLBACK');

      // B allocates — should get 1, not 2.
      await clientB.query('BEGIN');
      const seqB = await new PgNumberingCounter(clientB).nextSequence('test-rollback', 2026);
      expect(seqB).toBe(1);
      await clientB.query('COMMIT');
    } finally {
      clientA.release();
      clientB.release();
      await cleanupSeries('test-rollback');
    }
  });

  it('concurrent allocations produce consecutive numbers — no gap, no duplicate', async () => {
    const pool = getPool();
    const clientA = await pool.connect();
    const clientB = await pool.connect();

    try {
      // A locks the row.
      await clientA.query('BEGIN');
      const seqA = await new PgNumberingCounter(clientA).nextSequence('test-concurrent', 2026);

      // B tries to allocate — blocked by A's lock.
      await clientB.query('BEGIN');
      const promiseB = new PgNumberingCounter(clientB).nextSequence('test-concurrent', 2026);

      // Assert B is still pending: the row lock blocks it.
      const raceResult = await Promise.race([
        promiseB.then((v) => ({ resolved: true as const, value: v })),
        new Promise<{ resolved: false }>((resolve) => {
          setTimeout(() => {
            resolve({ resolved: false });
          }, 500);
        }),
      ]);
      expect(raceResult.resolved).toBe(false);

      // A commits, releasing the lock.
      await clientA.query('COMMIT');

      // B unblocks and completes.
      const seqB = await promiseB;
      await clientB.query('COMMIT');

      // Consecutive, no gap, no duplicate.
      expect(seqA).toBe(1);
      expect(seqB).toBe(2);
    } finally {
      clientA.release();
      clientB.release();
      await cleanupSeries('test-concurrent');
    }
  });

  it('counter increment + invoice save roll back together', async () => {
    const pool = getPool();
    const writer = await pool.connect();
    const reader = await pool.connect();

    try {
      // Everything — seed data, counter, invoice — lives in the same transaction.
      // The rollback undoes all of it; the reader verifies from outside.
      await writer.query('BEGIN');

      await seedReferenceData(writer);

      const counter = new PgNumberingCounter(writer);
      const invoiceRepo = new PgInvoiceRepository(writer, testIds);

      const seq = await counter.nextSequence('entity-fr', 2026);
      expect(seq).toBe(1);

      const invoice = makeDraftInvoice();
      await invoiceRepo.saveDraft(invoice, 'cra-composition-test');

      // Roll back — simulating any failure in the chain.
      await writer.query('ROLLBACK');

      // Read from a second connection: nothing persisted.
      const { rows: seriesRows } = await reader.query<{ last_sequence: number }>(
        `SELECT last_sequence FROM billing.numbering_series
         WHERE entity_id = 'entity-fr' AND fiscal_year = 2026`,
      );
      expect(seriesRows).toHaveLength(0);

      const { rows: invoiceRows } = await reader.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM billing.invoices WHERE id = $1`,
        [invoice.id],
      );
      expect(Number.parseInt(invoiceRows[0]!.count, 10)).toBe(0);
    } finally {
      writer.release();
      reader.release();
    }
  });
});

// ---------------------------------------------------------------------------
// Fixtures — same shapes as pg-invoice-repository.int.test.ts
// ---------------------------------------------------------------------------

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

const TEST_CLIENT = client({
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

function makeDraftInvoice(): Invoice {
  return Invoice.draft({
    id: 'invoice-composition-test',
    officeId: 'office-paris',
    seller: SELLER,
    billedTo: billedParty(TEST_CLIENT),
    supplyPeriod: period(2026, 3),
    lines: [
      regieLine({
        designation: 'Prestation de conseil — mars 2026',
        missionId: 'mission-audit',
        craId: 'cra-composition-test',
        period: '2026-03',
        quarterDays: quarterDays(84),
        tjmCents: 65_000,
        vat: { kind: 'taxable', basisPoints: 2000 },
      }),
    ],
    terms: paymentTerms({ kind: 'net', days: 30 }),
    mentions: legalMentions({
      latePaymentBasisPoints: 3000,
      recoveryIndemnityCents: RECOVERY_INDEMNITY_CENTS,
      earlyPaymentDiscount: { kind: 'none' },
      operationCategory: 'services',
      vatOnDebitsOption: true,
    }),
    validatedBy: ['bruno'],
  });
}

async function seedReferenceData(c: {
  query(text: string, values?: unknown[]): Promise<unknown>;
}): Promise<void> {
  await c.query(`
    INSERT INTO public.offices (id, name, city)
    VALUES ('office-paris', 'Paris', 'Paris')
    ON CONFLICT DO NOTHING;
  `);
  await c.query(`
    INSERT INTO public.practices (id, name)
    VALUES ('practice-audit', 'Audit')
    ON CONFLICT DO NOTHING;
  `);
  await c.query(`
    INSERT INTO public.clients (id, name, territoriality, billing_address_street,
      billing_address_postal_code, billing_address_city, billing_address_country)
    VALUES ('client-banque', 'Banque Nord SA', 'metropolitanFrance',
      '12 rue de la Boétie', '75008', 'Paris', 'FR')
    ON CONFLICT DO NOTHING;
  `);
  await c.query(`
    INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
    VALUES ('consultant-1', 'Alice', 'Dupont', 'alice@test.com', 'office-paris', 'practice-audit', 'consultant')
    ON CONFLICT DO NOTHING;
  `);
  await c.query(`
    INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
    VALUES ('mission-audit', 'client-banque', 'Mission Audit PASSI', 'Regie', '2026-01-01')
    ON CONFLICT DO NOTHING;
  `);
  await c.query(`
    INSERT INTO public.legal_entities (id, name, legal_form, share_capital_cents, siren,
      intra_community_vat_number, rcs_registration, address_street, address_postal_code,
      address_city, address_country, number_prefix)
    VALUES ('entity-fr', 'Sécurité & Conseil', 'SAS', 15000000, '493296529',
      'FR23493296529', 'RCS Paris 493 296 529', '12 rue de la Boétie', '75008', 'Paris', 'FR', 'SEC')
    ON CONFLICT DO NOTHING;
  `);
}
