import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { getMigrationPool } from '@erp/test-harness';

/**
 * Migration 013 applied to a database that already holds invoices — the hosted instance's
 * situation, which every CI job misses because each one migrates an empty service container
 * before seeding (ADR-0107, addendum of 22/10/2026).
 *
 * The rest of the integration suite runs on a database already at the latest migration, inside a
 * rolled-back transaction as `erp_app`. Neither fits here: 013 has to meet rows written at the
 * 012 shape, and taking that shape back on the shared tables would hold an exclusive lock on
 * `billing.invoices` while the other files run in parallel. So this file builds its own database,
 * as the migration role, and drops it afterwards.
 */

const MIGRATIONS_DIR = resolve(import.meta.dirname, '..', 'migrations');
const SCRATCH_DATABASE = `erp_migration_013_${String(process.pid)}`;

let scratch: pg.Client;

async function migrationFiles(predicate: (version: number) => boolean): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort();

  return files.filter((file) => predicate(Number.parseInt(file, 10)));
}

async function apply(file: string): Promise<void> {
  await scratch.query('BEGIN');
  await scratch.query(await readFile(join(MIGRATIONS_DIR, file), 'utf-8'));
  await scratch.query('COMMIT');
}

async function admin(sql: string): Promise<void> {
  const pool = getMigrationPool();
  try {
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

beforeAll(async () => {
  await admin(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`);
  await admin(`CREATE DATABASE ${SCRATCH_DATABASE}`);

  const url = new URL(process.env['MIGRATION_DATABASE_URL']!);
  url.pathname = `/${SCRATCH_DATABASE}`;
  scratch = new pg.Client({ connectionString: url.toString() });
  await scratch.connect();

  for (const file of await migrationFiles((version) => version < 13)) await apply(file);

  // Rows exactly as the 012-era repository wrote them: no seller snapshot, and `tax_cents = 0`
  // on a "not charged" group (`group.vatCents ?? 0`).
  await scratch.query(`
    INSERT INTO public.offices (id, name, city) VALUES ('m13-office', 'Paris', 'Paris');
    INSERT INTO public.legal_entities (id, name, legal_form, share_capital_cents, siren,
      intra_community_vat_number, rcs_registration, address_street, address_postal_code,
      address_city, address_country, number_prefix)
    VALUES ('m13-seller', 'Cabinet Cyber SAS', 'SAS', 10000000, '812345678', 'FR12812345678',
      'RCS Paris 812 345 678', '8 rue de la Paix', '75002', 'Paris', 'FR', 'CC');
    INSERT INTO billing.invoices (id, seller_id, office_id, status, supply_period,
      billed_to_client_id, billed_to_name, billed_to_billing_street, billed_to_billing_postal_code,
      billed_to_billing_city, billed_to_billing_country, billed_to_delivery_street,
      billed_to_delivery_postal_code, billed_to_delivery_city, billed_to_delivery_country,
      payment_terms_kind, payment_terms_days, mentions_operation_category,
      mentions_early_payment_kind, mentions_late_penalty_rate, mentions_recovery_indemnity)
    VALUES ('m13-invoice', 'm13-seller', 'm13-office', 'draft', '2026-08', 'm13-client',
      'Banque Nord SA', '12 rue', '75008', 'Paris', 'FR', '12 rue', '75008', 'Paris', 'FR',
      'net', 30, 'services', 'none', 1000, 4000);
    INSERT INTO billing.invoice_vat_groups (id, invoice_id, group_key, base_cents, tax_cents)
    VALUES ('m13-taxable', 'm13-invoice', 'taxable:2000', 150000, 30000),
           ('m13-not-charged', 'm13-invoice', 'notCharged:reverseChargeEuB2b', 90000, 0);
  `);

  const [migration013] = await migrationFiles((version) => version === 13);
  await apply(migration013!);
});

afterAll(async () => {
  await scratch.end();
  await admin(`DROP DATABASE IF EXISTS ${SCRATCH_DATABASE}`);
});

/** A refusal aborts the transaction, so each probe runs in one of its own and rolls it back. */
async function refuses(sql: string): Promise<unknown> {
  await scratch.query('BEGIN');
  try {
    await scratch.query(sql);
    return null;
  } catch (error) {
    return error;
  } finally {
    await scratch.query('ROLLBACK');
  }
}

describe('migration 013 — on a database that already holds invoices', () => {
  it('copies the seller snapshot from the legal entity the invoice already pointed at', async () => {
    const { rows } = await scratch.query<Record<string, string>>(
      `SELECT seller_name, seller_legal_form, seller_share_capital_cents, seller_siren,
              seller_intra_community_vat_number, seller_rcs_registration, seller_address_street,
              seller_address_postal_code, seller_address_city, seller_address_country,
              seller_number_prefix
         FROM billing.invoices WHERE id = 'm13-invoice'`,
    );

    expect(rows[0]).toEqual({
      seller_name: 'Cabinet Cyber SAS',
      seller_legal_form: 'SAS',
      seller_share_capital_cents: '10000000',
      seller_siren: '812345678',
      seller_intra_community_vat_number: 'FR12812345678',
      seller_rcs_registration: 'RCS Paris 812 345 678',
      seller_address_street: '8 rue de la Paix',
      seller_address_postal_code: '75002',
      seller_address_city: 'Paris',
      seller_address_country: 'FR',
      seller_number_prefix: 'CC',
    });
  });

  it('types each VAT group from its key, and gives "not charged" back its absent tax', async () => {
    const { rows } = await scratch.query(
      `SELECT id, vat_kind, vat_basis_points, vat_not_charged_reason, tax_cents
         FROM billing.invoice_vat_groups WHERE invoice_id = 'm13-invoice' ORDER BY id`,
    );

    expect(rows).toEqual([
      {
        id: 'm13-not-charged',
        vat_kind: 'notCharged',
        vat_basis_points: null,
        vat_not_charged_reason: 'reverseChargeEuB2b',
        tax_cents: null,
      },
      {
        id: 'm13-taxable',
        vat_kind: 'taxable',
        vat_basis_points: 2000,
        vat_not_charged_reason: null,
        tax_cents: '30000',
      },
    ]);
  });

  it('leaves the new columns NOT NULL once the rows are filled', async () => {
    const missingSeller = await refuses(
      `INSERT INTO billing.invoices (id, seller_id, office_id, supply_period, billed_to_client_id,
         billed_to_name, billed_to_billing_street, billed_to_billing_postal_code,
         billed_to_billing_city, billed_to_billing_country, billed_to_delivery_street,
         billed_to_delivery_postal_code, billed_to_delivery_city, billed_to_delivery_country,
         payment_terms_kind, payment_terms_days, mentions_operation_category,
         mentions_early_payment_kind, mentions_late_penalty_rate, mentions_recovery_indemnity)
       SELECT 'm13-other', seller_id, office_id, supply_period, billed_to_client_id,
         billed_to_name, billed_to_billing_street, billed_to_billing_postal_code,
         billed_to_billing_city, billed_to_billing_country, billed_to_delivery_street,
         billed_to_delivery_postal_code, billed_to_delivery_city, billed_to_delivery_country,
         payment_terms_kind, payment_terms_days, mentions_operation_category,
         mentions_early_payment_kind, mentions_late_penalty_rate, mentions_recovery_indemnity
       FROM billing.invoices WHERE id = 'm13-invoice'`,
    );
    const missingKind = await refuses(
      `INSERT INTO billing.invoice_vat_groups (id, invoice_id, group_key, base_cents, tax_cents)
       VALUES ('m13-untyped', 'm13-invoice', 'taxable:550', 1000, 55)`,
    );

    expect(String(missingSeller)).toContain('seller_name');
    expect(String(missingKind)).toContain('vat_kind');
  });

  it('still refuses a VAT kind outside the two the domain knows', async () => {
    const error = await refuses(
      `INSERT INTO billing.invoice_vat_groups (id, invoice_id, group_key, base_cents, tax_cents,
         vat_kind)
       VALUES ('m13-bogus', 'm13-invoice', 'exempt:0', 1000, 0, 'exempt')`,
    );

    expect(String(error)).toContain('vat_kind');
  });
});
