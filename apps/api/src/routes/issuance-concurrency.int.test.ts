import { closePool, getPool } from '@erp/test-harness';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { ApiConfig } from '../config.ts';
import { uuidv7 } from '../ids/uuidv7.ts';
import { pgTransactionally } from '../persistence/unit-of-work.ts';
import type { Persona } from '../personas/catalogue.ts';
import { PERSONA_COOKIE, signPersonaKey } from '../personas/cookie.ts';
import { inMemoryPersonas } from '../personas/testing/catalogue.ts';
import { buildServer } from '../server.ts';

/**
 * `api.int.test.ts`'s issuance tests run over `savepointTransactionally`: one checked-out client,
 * shared by every request in the test, with the whole test wrapped in a savepoint the harness
 * rolls back. That proves the *outcome* of each single-connection call, but it cannot demonstrate
 * the race ADR-0102 closes — `SELECT … FOR UPDATE` against your own already-held lock is a no-op,
 * so two "concurrent" calls on one client never actually contend.
 *
 * This file builds the real server over the real pool (`pgTransactionally`, the production
 * transaction boundary composed in `composition.ts`) and fires genuinely concurrent HTTP requests.
 * Each one gets its own checked-out connection, so the row lock and the advisory lock in
 * `PgInvoiceRepository.prepareIssuance` are exercised for real. Every row here is committed for
 * real — there is no wrapping transaction — and cleaned up by hand in `afterEach`.
 */

const ORIGIN = 'http://localhost:3000';
const SECRET = 'k'.repeat(40);
const OFFICE = 'concurrency-office';
const CONSULTANT = 'concurrency-billing';
const CLIENT = 'concurrency-client';

const config: ApiConfig = {
  databaseUrl: 'unused: every read goes through the injected unit of work',
  host: '127.0.0.1',
  port: 0,
  publicOrigin: ORIGIN,
  sessionSigningKey: SECRET,
  logLevel: 'silent',
};

const personas: readonly Persona[] = [
  {
    key: 'billing-concurrency',
    role: 'billing',
    consultantId: CONSULTANT,
    officeId: OFFICE,
    officeName: 'Concurrency',
    displayName: 'Billing Concurrency',
  },
];

function writingAs(key: string): { cookie: string; origin: string } {
  return { cookie: `${PERSONA_COOKIE}=${key}.${signPersonaKey(key, SECRET)}`, origin: ORIGIN };
}

const app: FastifyInstance = buildServer({
  config,
  clock: { now: () => new Date('2026-07-02T09:00:00.000Z') },
  probeDatabase: () => Promise.resolve(),
  personas: inMemoryPersonas(personas),
  transactionally: pgTransactionally(getPool(), uuidv7),
  newId: uuidv7,
});

let sellerIds: string[] = [];
let invoiceIds: string[] = [];

afterEach(async () => {
  const pool = getPool();
  if (invoiceIds.length > 0) {
    await pool.query(`DELETE FROM billing.invoice_vat_groups WHERE invoice_id = ANY($1)`, [
      invoiceIds,
    ]);
    await pool.query(`DELETE FROM billing.invoice_lines WHERE invoice_id = ANY($1)`, [invoiceIds]);
    await pool.query(`DELETE FROM billing.invoices WHERE id = ANY($1)`, [invoiceIds]);
  }
  if (sellerIds.length > 0) {
    await pool.query(`DELETE FROM billing.numbering_series WHERE entity_id = ANY($1)`, [sellerIds]);
    await pool.query(`DELETE FROM public.legal_entities WHERE id = ANY($1)`, [sellerIds]);
  }
  invoiceIds = [];
  sellerIds = [];
});

afterAll(async () => {
  await getPool().query(`DELETE FROM public.offices WHERE id = $1`, [OFFICE]);
  await app.close();
  await closePool();
});

/** A fresh seller per test, so each test's numbering series starts at 0 with no shared state. */
async function seedSeller(id: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO public.offices (id, name, city) VALUES ($1, 'Concurrency', 'Concurrency')
     ON CONFLICT DO NOTHING`,
    [OFFICE],
  );
  await pool.query(
    `INSERT INTO public.legal_entities (id, name, legal_form, share_capital_cents, siren,
       intra_community_vat_number, rcs_registration, address_street, address_postal_code,
       address_city, address_country, number_prefix)
     VALUES ($1, 'Concurrency SAS', 'SAS', 10000000, '000000000', 'FR00000000000',
             'RCS Test', '1 rue', '75000', 'Paris', 'France', 'CCY')`,
    [id],
  );
  sellerIds.push(id);
}

/**
 * A draft invoice with no lines: `Invoice.reconstitute` and `issue()` accept an empty line set
 * (totals of zero add up to themselves), and what this file exercises is the persistence race,
 * not the monetary calculation — which the domain suite and `api.int.test.ts` already cover.
 */
async function seedDraftInvoice(id: string, sellerId: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO billing.invoices (
       id, office_id, seller_id, supply_period,
       seller_name, seller_legal_form, seller_share_capital_cents, seller_siren,
       seller_intra_community_vat_number, seller_rcs_registration,
       seller_address_street, seller_address_postal_code, seller_address_city,
       seller_address_country, seller_number_prefix,
       billed_to_client_id, billed_to_name,
       billed_to_billing_street, billed_to_billing_postal_code, billed_to_billing_city,
       billed_to_billing_country,
       billed_to_delivery_street, billed_to_delivery_postal_code, billed_to_delivery_city,
       billed_to_delivery_country,
       payment_terms_kind, payment_terms_days,
       mentions_operation_category, mentions_early_payment_kind, mentions_late_penalty_rate,
       mentions_recovery_indemnity
     ) VALUES (
       $1, $2, $3, '2026-06',
       'Concurrency SAS', 'SAS', 10000000, '000000000', 'FR00000000000', 'RCS Test',
       '1 rue', '75000', 'Paris', 'France', 'CCY',
       $4, 'Concurrency Client',
       '1 rue', '75000', 'Paris', 'France',
       '1 rue', '75000', 'Paris', 'France',
       'net', 30,
       'services', 'none', 3000, 4000
     )`,
    [id, OFFICE, sellerId, CLIENT],
  );
  invoiceIds.push(id);
}

async function numberingSequence(sellerId: string): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query<{ last_sequence: number }>(
    `SELECT last_sequence FROM billing.numbering_series WHERE entity_id = $1 AND fiscal_year = 2026`,
    [sellerId],
  );
  return rows[0]?.last_sequence ?? 0;
}

interface IssuanceResponse {
  readonly statusCode: number;
  readonly body: { type?: string; replayed?: boolean; invoiceNumber?: string | null };
}

async function issue(invoiceId: string, key: string): Promise<IssuanceResponse> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/invoices/${invoiceId}/issuance`,
    headers: { ...writingAs('billing-concurrency'), 'idempotency-key': key },
  });
  return { statusCode: response.statusCode, body: response.json() };
}

describe('issuing an invoice — two real connections racing (ADR-0102)', () => {
  it('different keys, same invoice: exactly one issues, the other conflicts, one number burned', async () => {
    await seedSeller('concurrency-entity-a');
    await seedDraftInvoice('concurrency-invoice-a', 'concurrency-entity-a');

    const [first, second] = await Promise.all([
      issue('concurrency-invoice-a', 'concurrency-key-a1'),
      issue('concurrency-invoice-a', 'concurrency-key-a2'),
    ]);

    const statuses = [first.statusCode, second.statusCode].toSorted();
    expect(statuses).toStrictEqual([200, 409]);

    const winner = first.statusCode === 200 ? first : second;
    const loser = first.statusCode === 200 ? second : first;
    expect(winner.body.invoiceNumber).toMatch(/^CCY-2026-\d{6}$/u);
    expect(loser.body.type).toBe('/problems/invoice-transition-not-allowed');
    expect(loser.body.invoiceNumber).toBeUndefined();

    expect(await numberingSequence('concurrency-entity-a')).toBe(1);
  });

  it('same key, same invoice: one issues and one replays, never two numbers', async () => {
    await seedSeller('concurrency-entity-b');
    await seedDraftInvoice('concurrency-invoice-b', 'concurrency-entity-b');

    const [first, second] = await Promise.all([
      issue('concurrency-invoice-b', 'concurrency-key-b'),
      issue('concurrency-invoice-b', 'concurrency-key-b'),
    ]);

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(first.body.invoiceNumber).toMatch(/^CCY-2026-\d{6}$/u);
    expect(second.body.invoiceNumber).toBe(first.body.invoiceNumber);
    // Exactly one of the two actually allocated the number; the other read it back.
    expect([first.body.replayed, second.body.replayed].toSorted()).toStrictEqual([false, true]);

    expect(await numberingSequence('concurrency-entity-b')).toBe(1);
  });

  it('same key, different invoices: exactly one issues, the other is refused as a key reuse', async () => {
    await seedSeller('concurrency-entity-c');
    await seedDraftInvoice('concurrency-invoice-c1', 'concurrency-entity-c');
    await seedDraftInvoice('concurrency-invoice-c2', 'concurrency-entity-c');

    const [first, second] = await Promise.all([
      issue('concurrency-invoice-c1', 'concurrency-key-c'),
      issue('concurrency-invoice-c2', 'concurrency-key-c'),
    ]);

    const statuses = [first.statusCode, second.statusCode].toSorted();
    // Never a raw 500 from the unique index: the advisory lock in `prepareIssuance` serializes
    // the check against the insert, so the loser sees a typed conflict every time.
    expect(statuses).toStrictEqual([200, 409]);

    const loser = first.statusCode === 200 ? second : first;
    expect(loser.body.type).toBe('/problems/idempotency-key-reused');
    expect(loser.body.invoiceNumber).toBeUndefined();

    expect(await numberingSequence('concurrency-entity-c')).toBe(1);
  });
});
