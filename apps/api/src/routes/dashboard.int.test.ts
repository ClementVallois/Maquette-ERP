import { useTestTransaction } from '@erp/test-harness';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ApiConfig } from '../config.ts';
import { uuidv7 } from '../ids/uuidv7.ts';
import type { Persona } from '../personas/catalogue.ts';
import { PERSONA_COOKIE, signPersonaKey } from '../personas/cookie.ts';
import { inMemoryPersonas } from '../personas/testing/catalogue.ts';
import { buildServer } from '../server.ts';
import { savepointTransactionally } from '../testing/transaction.ts';

/**
 * `GET /api/v1/dashboard` (front-end plan Phase 5.3): honest, role-scoped aggregates, computed from the same
 * repositories every other read already goes through — nothing invented for this endpoint, and
 * nothing that ever puts `Cjm`, `Tjm` or a margin field on the wire (BUILD-RULES § Authorization,
 * "never in a list", extended here to an aggregate view of the same protected asset).
 *
 * June 2026 has **22** workable days by the real calendar (verified directly against
 * `workingCalendar()` — `PUBLIC_HOLIDAYS` carries no June 2026 date, and 2026-06-01 is an ordinary
 * Monday, not a holiday), which is the number this file's `remainingWorkableDays` assertion is
 * built from — not the 21 a couple of sibling fixtures use for their own, unrelated reasons.
 */

const transaction = useTestTransaction();

const ORIGIN = 'http://localhost:3000';
const SECRET = 'd'.repeat(40);

const PARIS = 'dashapi-office-paris';
// ADR-0098's office-scope test seeds this office only inside its own `it()`, not in `beforeEach`
// — every other test in this file stays Paris-only, exactly as before.
const LYON = 'dashapi-office-lyon';
const ALICE = 'dashapi-alice';
const CHLOE = 'dashapi-chloe';
const BRUNO = 'dashapi-bruno';
const HENRI = 'dashapi-henri';
const MISSION = 'dashapi-mission';
const CLIENT = 'dashapi-client';
const ENTITY = 'dashapi-entity';
const CRA_ALICE = 'dashapi-cra-alice';
const CRA_CHLOE = 'dashapi-cra-chloe';

/** Every workable June 2026 day, per the real domain calendar (22 — see the file's own header). */
const WORKABLE_JUNE = [
  '2026-06-01',
  '2026-06-02',
  '2026-06-03',
  '2026-06-04',
  '2026-06-05',
  '2026-06-08',
  '2026-06-09',
  '2026-06-10',
  '2026-06-11',
  '2026-06-12',
  '2026-06-15',
  '2026-06-16',
  '2026-06-17',
  '2026-06-18',
  '2026-06-19',
  '2026-06-22',
  '2026-06-23',
  '2026-06-24',
  '2026-06-25',
  '2026-06-26',
  '2026-06-29',
  '2026-06-30',
] as const;

/** July, so June has closed by the clock the dashboard's `lateCras` reads. */
const NOW = new Date('2026-07-02T09:00:00.000Z');

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
    key: 'consultant-paris',
    role: 'consultant',
    consultantId: ALICE,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Alice Martin',
  },
  {
    key: 'manager-paris',
    role: 'manager',
    consultantId: BRUNO,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Bruno Leroy',
  },
  {
    key: 'billing-paris',
    role: 'billing',
    consultantId: HENRI,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Henri Dubois',
  },
  {
    key: 'manager-lyon',
    role: 'manager',
    consultantId: 'dashapi-emma-lyon-manager',
    officeId: LYON,
    officeName: 'Lyon',
    displayName: 'Emma Girard',
  },
];

function as(key: string): { cookie: string } {
  return { cookie: `${PERSONA_COOKIE}=${key}.${signPersonaKey(key, SECRET)}` };
}

function writingAs(key: string): { cookie: string; origin: string } {
  return { ...as(key), origin: ORIGIN };
}

let app: FastifyInstance;

beforeEach(async () => {
  const { client } = transaction;

  app = buildServer({
    config,
    clock: { now: () => NOW },
    probeDatabase: () => Promise.resolve(),
    personas: inMemoryPersonas(personas),
    transactionally: savepointTransactionally(client, uuidv7),
    newId: uuidv7,
  });

  await client.query(`INSERT INTO public.offices (id, name, city) VALUES ($1, 'Paris', 'Paris')`, [
    PARIS,
  ]);
  await client.query(
    `INSERT INTO public.practices (id, name) VALUES ('dashapi-practice', 'Audit')`,
  );
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Alice', 'Martin', 'dashapi-a@t', $5, 'dashapi-practice', 'consultant'),
            ($2, 'Chloé', 'Nguyen', 'dashapi-c@t', $5, 'dashapi-practice', 'consultant'),
            ($3, 'Bruno', 'Leroy', 'dashapi-b@t', $5, 'dashapi-practice', 'manager'),
            ($4, 'Henri', 'Dubois', 'dashapi-h@t', $5, 'dashapi-practice', 'director')`,
    [ALICE, CHLOE, BRUNO, HENRI, PARIS],
  );
  await client.query(
    `INSERT INTO public.clients (id, name, siren, territoriality, billing_address_street,
       billing_address_postal_code, billing_address_city, billing_address_country)
     VALUES ($1, 'Banque Nationale de Test', '443061841', 'metropolitanFrance', '10 av', '75008',
             'Paris', 'France')`,
    [CLIENT],
  );
  await client.query(
    `INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
     VALUES ($1, $2, 'Audit DORA', 'Regie', '2026-01-05')`,
    [MISSION, CLIENT],
  );
  await client.query(
    `INSERT INTO public.mission_tjm (id, mission_id, from_date, to_date, tjm_cents)
     VALUES ($1, $2, '2026-01-05', NULL, 80000)`,
    [uuidv7(), MISSION],
  );
  await client.query(
    `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
     VALUES ($1, $3, $4, '2026-01-05', NULL), ($2, $5, $4, '2026-01-05', NULL)`,
    [uuidv7(), uuidv7(), ALICE, MISSION, CHLOE],
  );
  await client.query(
    `INSERT INTO public.manager_attachments (id, consultant_id, manager_id, from_date, to_date)
     VALUES ($1, $3, $4, '2024-01-01', NULL), ($2, $5, $4, '2024-01-01', NULL)`,
    [uuidv7(), uuidv7(), ALICE, BRUNO, CHLOE],
  );
  await client.query(
    `INSERT INTO public.legal_entities (id, name, legal_form, share_capital_cents, siren,
       intra_community_vat_number, rcs_registration, address_street, address_postal_code,
       address_city, address_country, number_prefix)
     VALUES ($1, 'SecureCo SAS', 'SAS', 10000000, '732829320', 'FR27732829320',
             'RCS Paris 732 829 320', '42 rue', '75008', 'Paris', 'France', 'DSH')`,
    [ENTITY],
  );

  // Alice's June: a draft, five of the month's 22 workable days recorded — twenty quarter-days,
  // and seventeen days still not entered.
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
     VALUES ($1, $2, $3, '2026-06', 'draft')`,
    [CRA_ALICE, ALICE, PARIS],
  );
  for (const day of WORKABLE_JUNE.slice(0, 5)) {
    await client.query(
      `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
       VALUES ($1, $2, $3, 'worked', $4, 4)`,
      [uuidv7(), CRA_ALICE, day, MISSION],
    );
  }

  // Chloé's June: submitted, the whole month recorded — this is the one a manager decides on and
  // the one that becomes an invoice.
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
     VALUES ($1, $2, $3, '2026-06', 'submitted', '2026-07-01T09:00:00Z')`,
    [CRA_CHLOE, CHLOE, PARIS],
  );
  for (const day of WORKABLE_JUNE) {
    await client.query(
      `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
       VALUES ($1, $2, $3, 'worked', $4, 4)`,
      [uuidv7(), CRA_CHLOE, day, MISSION],
    );
  }
});

afterEach(async () => {
  await app.close();
});

/** Validates Chloé's June, producing the draft invoice the manager/billing tests read. */
async function validateChloeJune(): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/cras/${CRA_CHLOE}/validation`,
    headers: writingAs('manager-paris'),
  });

  expect(response.statusCode).toBe(200);
}

async function dashboard(persona: string): Promise<Awaited<ReturnType<typeof app.inject>>> {
  return app.inject({
    method: 'GET',
    url: '/api/v1/dashboard?period=2026-06',
    headers: as(persona),
  });
}

describe('GET /api/v1/dashboard — consultant', () => {
  it('reports my month, in quarter-days and in days not yet entered', async () => {
    const response = await dashboard('consultant-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      period: '2026-06',
      availablePeriods: ['2026-06'],
      role: 'consultant',
      myMonthStatus: 'draft',
      recordedQuarterDays: 20,
      remainingWorkableDays: 17,
      refusedPeriods: [],
      // Alice's only Cra is a draft: no submission, refusal or validation ever set
      // `statusChangedAt` on it, so there is nothing to show yet.
      recentActivity: [],
    });
  });

  it('ADR-0082: names a refusal from another period, alongside the requested month', async () => {
    // Alice's May: refused, resolved neither way yet. Requesting June (her current draft) must
    // not make this disappear — the whole point of the fix.
    await transaction.client.query(
      `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
       VALUES ($1, $2, $3, '2026-05', 'refused')`,
      [uuidv7(), ALICE, PARIS],
    );

    const response = await dashboard('consultant-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      period: '2026-06',
      myMonthStatus: 'draft',
      refusedPeriods: ['2026-05'],
    });
  });
});

describe('GET /api/v1/dashboard — manager', () => {
  it('counts a submitted month awaiting a decision, before anything is validated', async () => {
    const response = await dashboard('manager-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      period: '2026-06',
      availablePeriods: ['2026-06'],
      role: 'manager',
      pendingDecisions: 1,
      billableCents: 0,
      // Both Cras are unvalidated in a month the clock has closed (ADR-0054).
      lateCras: 2,
      awaitingDecision: [
        {
          craId: CRA_CHLOE,
          consultantId: CHLOE,
          consultantName: 'Chloé Nguyen',
          period: '2026-06',
          statusChangedAt: '2026-07-01T09:00:00.000Z',
        },
      ],
      // ADR-0098: Alice and Chloé are both assigned to `MISSION` (Regie, not `Intercontrat`) —
      // both count as `onMission`, none in `Intercontrat`. `NOW` (02/07) falls inside both
      // assignments' open-ended `from_date`, so today's snapshot sees them.
      staffing: { onMission: 2, intercontrat: 0 },
      // The one Cra with a `statusChangedAt` — Alice's is still a draft. `at` is the fixture's
      // own literal `submitted_at`, not a clock read at request time.
      recentActivity: [
        {
          key: CRA_CHLOE,
          kind: 'cra',
          recordId: CRA_CHLOE,
          status: 'submitted',
          period: '2026-06',
          name: 'Chloé Nguyen',
          at: '2026-07-01T09:00:00.000Z',
          consultantId: CHLOE,
        },
      ],
    });
  });

  it('moves the figures once the month is validated', async () => {
    await validateChloeJune();

    const response = await dashboard('manager-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      period: '2026-06',
      availablePeriods: ['2026-06'],
      role: 'manager',
      pendingDecisions: 0,
      // 22 days × 800 € = 17 600 € HT.
      billableCents: 1_760_000,
      lateCras: 1,
      awaitingDecision: [],
      // ADR-0098: unaffected by validating Chloé's Cra — staffing reads assignments, not Cra
      // status.
      staffing: { onMission: 2, intercontrat: 0 },
      // Same Cra, now validated: `statusChangedAt` moves to `NOW`, the fixed clock
      // `validateChloeJune()`'s own request runs under — deterministic, not a wall-clock read.
      recentActivity: [
        {
          key: CRA_CHLOE,
          kind: 'cra',
          recordId: CRA_CHLOE,
          status: 'validated',
          period: '2026-06',
          name: 'Chloé Nguyen',
          at: NOW.toISOString(),
          consultantId: CHLOE,
        },
      ],
    });
  });

  it('ADR-0082: counts a decision pending in another period too, requested period unchanged', async () => {
    // Chloé's May: submitted, decided by nobody yet — a month before the one requested below.
    // Before this fix, a manager viewing June never learned this existed.
    await transaction.client.query(
      `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
       VALUES ($1, $2, $3, '2026-05', 'submitted')`,
      [uuidv7(), CHLOE, PARIS],
    );

    const response = await dashboard('manager-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      period: '2026-06',
      // Chloé's June, plus Chloé's May.
      pendingDecisions: 2,
      // 22 workable June days × 800 € — the requested period's own total, unaffected by May.
      billableCents: 0,
    });
  });

  it('package 08: counts and lists the whole office past the 200-Cra page cap, not just its first 200 rows', async () => {
    // 220 more submitted Cras across 220 distinct, deliberately old periods — on top of the two
    // `beforeEach` already seeds (Alice's June draft, Chloé's June submission) — so the office
    // holds 222 Cras total, past `CRA_LIST_MAX_PAGE_SIZE` (200). Before package 08, every one of
    // `pendingDecisions`, `lateCras` and `availablePeriods` was derived from one `list` page
    // ordered `period DESC`: the 22 oldest of these (2000-01..2001-10) never appeared in it.
    await transaction.client.query(`
      INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
      SELECT 'dashapi-old-' || g, '${ALICE}', '${PARIS}',
             to_char(DATE '2000-01-01' + (g || ' month')::interval, 'YYYY-MM'), 'submitted',
             TIMESTAMPTZ '2000-01-01' + (g || ' day')::interval
      FROM generate_series(1, 220) AS g
    `);

    const response = await dashboard('manager-paris');

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      readonly pendingDecisions: number;
      readonly lateCras: number;
      readonly availablePeriods: readonly string[];
    }>();
    // 220 synthetic + Chloé's June — Alice's June is a draft, not a decision awaiting one.
    expect(body.pendingDecisions).toBe(221);
    // Every one of the 222 Cras in the office is in a closed period (2000s or June 2026, both
    // before NOW's July) and not validated.
    expect(body.lateCras).toBe(222);
    expect(body.availablePeriods).toHaveLength(221); // 220 synthetic + '2026-06'.
    // The single oldest period — the exact row a 200-row page ordered newest-first would drop.
    expect(body.availablePeriods).toContain('2000-02');
  });
});

/**
 * Item 3, QA round 5 (ADR-0098): `managerStaffingSnapshot`'s two contracts — the discriminator is
 * the mission's **name**, not its `billing_model`, and the read is scoped by office.
 */
describe('GET /api/v1/dashboard — manager staffing (ADR-0098)', () => {
  it('splits by mission name, not billing model: a non-Intercontrat Forfait mission still counts as onMission', async () => {
    const claire = 'dashapi-claire-intercontrat';
    const david = 'dashapi-david-forfait';
    const missionIntercontrat = 'dashapi-mission-intercontrat';
    const missionForfait = 'dashapi-mission-forfait-interne';

    await transaction.client.query(
      `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
       VALUES ($1, 'Claire', 'Petit', 'dashapi-claire@t', $3, 'dashapi-practice', 'consultant'),
              ($2, 'David', 'Roux', 'dashapi-david@t', $3, 'dashapi-practice', 'consultant')`,
      [claire, david, PARIS],
    );
    // Two missions with the same `billing_model` ('Forfait') as `Intercontrat` genuinely is
    // (ADR-0046) — only the one named exactly `Intercontrat` may read as such; a same-shaped
    // internal-sounding Forfait mission with any other name is real staffed work.
    await transaction.client.query(
      `INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
       VALUES ($1, $3, 'Intercontrat', 'Forfait', '2026-01-05'),
              ($2, $3, 'Refonte SI interne', 'Forfait', '2026-01-05')`,
      [missionIntercontrat, missionForfait, CLIENT],
    );
    await transaction.client.query(
      `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
       VALUES ($1, $3, $5, '2026-01-05', NULL), ($2, $4, $6, '2026-01-05', NULL)`,
      [uuidv7(), uuidv7(), claire, david, missionIntercontrat, missionForfait],
    );

    const response = await dashboard('manager-paris');

    expect(response.statusCode).toBe(200);
    // Alice + Chloé (Regie, from `beforeEach`) + David (Forfait, not `Intercontrat`) = onMission;
    // Claire (the mission literally named `Intercontrat`) alone in the other bucket.
    expect(response.json()).toMatchObject({ staffing: { onMission: 3, intercontrat: 1 } });
  });

  it('a manager reads only their own office’s split, never the other’s', async () => {
    const emma = 'dashapi-emma-lyon-manager';
    const marc = 'dashapi-marc-lyon-intercontrat';
    const missionIntercontrat = 'dashapi-mission-intercontrat-lyon';

    await transaction.client.query(
      `INSERT INTO public.offices (id, name, city) VALUES ($1, 'Lyon', 'Lyon')`,
      [LYON],
    );
    await transaction.client.query(
      `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
       VALUES ($1, 'Emma', 'Girard', 'dashapi-emma@t', $3, 'dashapi-practice', 'manager'),
              ($2, 'Marc', 'Faure', 'dashapi-marc@t', $3, 'dashapi-practice', 'consultant')`,
      [emma, marc, LYON],
    );
    await transaction.client.query(
      `INSERT INTO public.missions (id, client_id, name, billing_model, start_date)
       VALUES ($1, $2, 'Intercontrat', 'Forfait', '2026-01-05')`,
      [missionIntercontrat, CLIENT],
    );
    await transaction.client.query(
      `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
       VALUES ($1, $2, $3, '2026-01-05', NULL)`,
      [uuidv7(), marc, missionIntercontrat],
    );

    const [parisResponse, lyonResponse] = await Promise.all([
      dashboard('manager-paris'),
      dashboard('manager-lyon'),
    ]);

    expect(parisResponse.statusCode).toBe(200);
    expect(lyonResponse.statusCode).toBe(200);
    // Deliberately not the same numbers either way round, so a scope leak (reading both offices,
    // or swapping them) cannot pass by coincidence: Paris is Alice + Chloé on a client mission and
    // nobody in `Intercontrat`; Lyon is the opposite shape, one consultant and it is Marc, in
    // `Intercontrat`.
    expect(parisResponse.json()).toMatchObject({ staffing: { onMission: 2, intercontrat: 0 } });
    expect(lyonResponse.json()).toMatchObject({ staffing: { onMission: 0, intercontrat: 1 } });
  });
});

describe('GET /api/v1/dashboard — billing', () => {
  it('counts drafts before an issuance', async () => {
    await validateChloeJune();

    const response = await dashboard('billing-paris');

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      readonly draftInvoices: number;
      readonly issuedInvoices: number;
      readonly totalTtcIssuedCents: number;
      readonly oldestDrafts: readonly {
        readonly billedToName: string;
        readonly supplyPeriod: string;
        readonly totalTtcCents: number;
        readonly consultantName: string;
      }[];
    }>();
    expect(body).toMatchObject({
      period: '2026-06',
      role: 'billing',
      draftInvoices: 1,
      issuedInvoices: 0,
      totalTtcIssuedCents: 0,
    });
    // Chloé's draft: HT is 22 days × 800 € = 17 600 €, TTC at 20% is 21 120 € — computed from the
    // lines, not stored, since a draft's totals are provisional (Rank B1).
    // F10: `consultantName` is the source-consultant discriminator A7/A13 already carry on the
    // invoice and pré-facturier lists, resolved from the draft's own source Cra.
    expect(body.oldestDrafts).toStrictEqual([
      {
        invoiceId: expect.any(String),
        billedToName: 'Banque Nationale de Test',
        supplyPeriod: '2026-06',
        totalTtcCents: 2_112_000,
        consultantName: 'Chloé Nguyen',
      },
    ]);
  });

  it('moves the invoice from draft to issued, and sums its TTC total', async () => {
    await validateChloeJune();

    // `GET /api/v1/invoices` takes no `period` (Annex A only lists `limit`/`offset` for it); this
    // fixture holds exactly one invoice, so the plain list already answers the one this test wants.
    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/invoices',
      headers: as('billing-paris'),
    });
    const invoiceId = listed.json<{ invoices: { id: string }[] }>().invoices[0]!.id;

    const issued = await app.inject({
      method: 'POST',
      url: `/api/v1/invoices/${invoiceId}/issuance`,
      headers: { ...writingAs('billing-paris'), 'idempotency-key': 'dashboard-issuance-0001' },
    });
    expect(issued.statusCode).toBe(200);

    const response = await dashboard('billing-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toStrictEqual({
      period: '2026-06',
      availablePeriods: ['2026-06'],
      role: 'billing',
      draftInvoices: 0,
      issuedInvoices: 1,
      // 17 600 € HT × 1,20 = 21 120 € TTC.
      totalTtcIssuedCents: 2_112_000,
      oldestDrafts: [],
      // `invoiceId` above is the only non-deterministic value here — `uuidv7`, not the fixed
      // clock — so it is read back rather than hard-coded; `at` is `issueDate`, derived from
      // `NOW` in the firm's own time zone (UTC+2 in July), which is why it is a bare date and not
      // a full instant.
      recentActivity: [
        {
          key: invoiceId,
          kind: 'invoice',
          recordId: invoiceId,
          status: 'issued',
          period: '2026-06',
          name: 'Banque Nationale de Test',
          at: '2026-07-02',
        },
      ],
    });
  });

  /** Package 08: fills every `NOT NULL` column a bulk `generate_series` invoice row needs. */
  async function bulkInsertInvoices(options: {
    readonly idPrefix: string;
    readonly count: number;
    readonly status: 'draft' | 'issued';
    readonly supplyPeriod: string;
    readonly issueDate?: string;
  }): Promise<void> {
    await transaction.client.query(
      `INSERT INTO billing.invoices (
        id, office_id, seller_id, status, supply_period,
        seller_name, seller_legal_form, seller_share_capital_cents, seller_siren,
        seller_intra_community_vat_number, seller_rcs_registration,
        seller_address_street, seller_address_postal_code, seller_address_city,
        seller_address_country, seller_number_prefix,
        billed_to_client_id, billed_to_name,
        billed_to_billing_street, billed_to_billing_postal_code,
        billed_to_billing_city, billed_to_billing_country,
        billed_to_delivery_street, billed_to_delivery_postal_code,
        billed_to_delivery_city, billed_to_delivery_country,
        payment_terms_kind, payment_terms_days,
        mentions_operation_category, mentions_early_payment_kind,
        mentions_late_penalty_rate, mentions_recovery_indemnity, mentions_vat_on_debits,
        total_ht_cents, total_tax_cents, total_ttc_cents, issue_date
      )
      SELECT $1 || '-' || g, $6, $7, $2, $3,
             'SecureCo SAS', 'SAS', 10000000, '732829320', 'FR27732829320',
             'RCS Paris 732 829 320', '42 rue', '75008', 'Paris', 'France', 'DSH',
             $8, 'Client Bulk Test',
             '1 rue Test', '75001', 'Paris', 'France',
             '1 rue Test', '75001', 'Paris', 'France',
             'net', 30, 'services', 'none', 1000, 4000, false,
             1000 * g, 200 * g, 1200 * g, ($4::date + (g || ' day')::interval)::date
      FROM generate_series(1, $5) AS g`,
      [
        options.idPrefix,
        options.status,
        options.supplyPeriod,
        options.issueDate ?? '2000-01-01',
        options.count,
        PARIS,
        ENTITY,
        CLIENT,
      ],
    );
  }

  it('package 08: counts, sums and lists the whole office past the 50-invoice page cap', async () => {
    // 55 issued invoices in the requested period, on top of `MAX_PAGE_SIZE` (50): before package
    // 08, `issuedInvoices`/`totalTtcIssuedCents` were a `.filter`/`.reduce` over one 50-row page,
    // silently dropping the 51st..55th invoice's worth of both the count and the sum.
    await bulkInsertInvoices({
      idPrefix: 'dashapi-issued',
      count: 55,
      status: 'issued',
      supplyPeriod: '2026-06',
    });
    // 60 drafts, one per period, spanning back to 2000-02 — the true oldest, past a naive
    // 50-row page ordered newest-first (ADR-0082's own reasoning, applied to `oldestDrafts`).
    await transaction.client.query(`
      INSERT INTO billing.invoices (
        id, office_id, seller_id, status, supply_period,
        seller_name, seller_legal_form, seller_share_capital_cents, seller_siren,
        seller_intra_community_vat_number, seller_rcs_registration,
        seller_address_street, seller_address_postal_code, seller_address_city,
        seller_address_country, seller_number_prefix,
        billed_to_client_id, billed_to_name,
        billed_to_billing_street, billed_to_billing_postal_code,
        billed_to_billing_city, billed_to_billing_country,
        billed_to_delivery_street, billed_to_delivery_postal_code,
        billed_to_delivery_city, billed_to_delivery_country,
        payment_terms_kind, payment_terms_days,
        mentions_operation_category, mentions_early_payment_kind,
        mentions_late_penalty_rate, mentions_recovery_indemnity, mentions_vat_on_debits
      )
      SELECT 'dashapi-old-draft-' || g, '${PARIS}', '${ENTITY}', 'draft',
             to_char(DATE '2000-01-01' + (g || ' month')::interval, 'YYYY-MM'),
             'SecureCo SAS', 'SAS', 10000000, '732829320', 'FR27732829320',
             'RCS Paris 732 829 320', '42 rue', '75008', 'Paris', 'France', 'DSH',
             '${CLIENT}', 'Client Bulk Test',
             '1 rue Test', '75001', 'Paris', 'France',
             '1 rue Test', '75001', 'Paris', 'France',
             'net', 30, 'services', 'none', 1000, 4000, false
      FROM generate_series(1, 60) AS g
    `);

    const response = await dashboard('billing-paris');

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      readonly draftInvoices: number;
      readonly issuedInvoices: number;
      readonly totalTtcIssuedCents: number;
      readonly availablePeriods: readonly string[];
      readonly oldestDrafts: readonly { readonly supplyPeriod: string }[];
    }>();
    expect(body.issuedInvoices).toBe(55);
    // Sum of 1200*g for g=1..55 = 1200 * (55*56/2) = 1200 * 1540 = 1_848_000.
    expect(body.totalTtcIssuedCents).toBe(1_848_000);
    expect(body.availablePeriods).toContain('2000-02'); // The oldest, past a 50-row page.
    expect(body.oldestDrafts).toHaveLength(10);
    expect(body.oldestDrafts[0]!.supplyPeriod).toBe('2000-02'); // The true oldest draft overall.
  });

  it('ADR-0109: excludes a cancelled invoice from issuedInvoices and totalTtcIssuedCents', async () => {
    // A cancelled invoice's number and amount still exist for provenance, but it is no longer
    // owed — counting it as issued revenue would overstate what the firm can actually collect.
    // This is a decision, not an accident of the label: the query filters `status = 'issued'`
    // explicitly, and this fixture is what proves it rather than merely asserting the filter text.
    await bulkInsertInvoices({
      idPrefix: 'dashapi-cancelled',
      count: 1,
      status: 'issued',
      supplyPeriod: '2026-06',
    });
    await transaction.client.query(
      `UPDATE billing.invoices SET status = 'cancelledByCreditNote' WHERE id = 'dashapi-cancelled-1'`,
    );

    const response = await dashboard('billing-paris');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      draftInvoices: 0,
      issuedInvoices: 0,
      totalTtcIssuedCents: 0,
    });
  });
});

describe('GET /api/v1/dashboard — the Gate: no margin field, for any role', () => {
  it('never carries Cjm, Tjm or a margin field, on any of the three payloads', async () => {
    await validateChloeJune();

    for (const persona of ['consultant-paris', 'manager-paris', 'billing-paris']) {
      const response = await dashboard(persona);

      expect(response.statusCode).toBe(200);
      expect(response.body).not.toContain('cjmCents');
      expect(response.body).not.toContain('tjmCents');
      expect(response.body).not.toContain('marginCents');
      expect(response.body).not.toContain('cjm');
      expect(response.body).not.toContain('margin');
    }
  });
});

describe('the edges of the dashboard', () => {
  it('refuses a request with no persona at all', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard?period=2026-06' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ type: '/problems/no-persona' });
  });

  it('refuses a request with no period, before any module is called', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard',
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ type: '/problems/malformed-request' });
  });
});
