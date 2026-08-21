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

import { frenchEuros } from './format.ts';
import { LABELS } from './labels.ts';
import { PATHS } from './paths.ts';

/**
 * The pré-facturier, the reveal behind it, and the two refusals the reveal is there to
 * demonstrate.
 *
 * The screen is where this repository's third claim — authorization by role **and** by scope — is
 * checked on HTML rather than on JSON. Two personas reach the same table and only one may open a
 * margin; a manager of another office may not open one at all, and the page says which rule
 * refused. Neither of those is provable from a list view, because a list is filtered rather than
 * refused (ADR-0003).
 */

const transaction = useTestTransaction();

const ORIGIN = 'http://localhost:3000';
const SECRET = 'p'.repeat(40);

const PARIS = 'pf-office-paris';
const LYON = 'pf-office-lyon';
const ALICE = 'pf-alice';
const BRUNO = 'pf-bruno';
const CHLOE = 'pf-chloe';
const HENRI = 'pf-henri';
const EMMA = 'pf-emma';
const MISSION = 'pf-mission';
const FORFAIT = 'pf-mission-forfait';
const CLIENT = 'pf-client';
const ENTITY = 'pf-entity';
const CRA_VALIDATED = 'pf-cra-validated';
const CRA_SUBMITTED = 'pf-cra-submitted';

/** July 2026 for the clock, so June is a closed month and its unvalidated days are late. */
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
    consultantId: EMMA,
    officeId: LYON,
    officeName: 'Lyon',
    displayName: 'Emma Roux',
  },
  {
    key: 'consultant-paris',
    role: 'consultant',
    consultantId: ALICE,
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Alice Martin',
  },
];

function as(key: string): { cookie: string } {
  return { cookie: `${PERSONA_COOKIE}=${key}.${signPersonaKey(key, SECRET)}` };
}

/** Every workable day of June 2026 — the 1st is Pentecost Monday and is not one. */
function workedDaysOfJune(): string[] {
  const days: string[] = [];
  for (let day = 2; day <= 30; day += 1) {
    const iso = `2026-06-${String(day).padStart(2, '0')}`;
    const weekday = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(iso);
  }

  return days;
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

  await client.query(
    `INSERT INTO public.offices (id, name, city) VALUES ($1, 'Paris', 'Paris'), ($2, 'Lyon', 'Lyon')`,
    [PARIS, LYON],
  );
  await client.query(`INSERT INTO public.practices (id, name) VALUES ('pf-practice', 'Audit')`);
  await client.query(
    `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
     VALUES ($1, 'Alice', 'Martin', 'pf-a@t', $5, 'pf-practice', 'consultant'),
            ($2, 'Bruno', 'Leroy', 'pf-b@t', $5, 'pf-practice', 'manager'),
            ($3, 'Chloé', 'Nguyen', 'pf-c@t', $5, 'pf-practice', 'consultant'),
            ($4, 'Henri', 'Dubois', 'pf-h@t', $5, 'pf-practice', 'manager'),
            ($6, 'Emma', 'Roux', 'pf-e@t', $7, 'pf-practice', 'manager')`,
    [ALICE, BRUNO, CHLOE, HENRI, PARIS, EMMA, LYON],
  );
  // Its own grade, at a rank no seed uses: `public.grades.rank` is UNIQUE across the table, and
  // the harness rolls back what this test writes without hiding what was committed before it.
  await client.query(
    `INSERT INTO public.grades (id, name, rank) VALUES ('pf-grade', 'Confirmé', 501)`,
  );
  await client.query(
    `INSERT INTO public.consultant_grades (id, consultant_id, grade_id, from_date, to_date, cjm_cents)
     VALUES ($1, $3, 'pf-grade', '2024-01-01', NULL, 42000),
            ($2, $4, 'pf-grade', '2024-01-01', NULL, 42000)`,
    [uuidv7(), uuidv7(), ALICE, CHLOE],
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
     VALUES ($1, $3, 'Audit DORA', 'Regie', '2026-01-05'),
            ($2, $3, 'Refonte SOC', 'Forfait', '2026-01-05')`,
    [MISSION, FORFAIT, CLIENT],
  );
  await client.query(
    `INSERT INTO public.mission_tjm (id, mission_id, from_date, to_date, tjm_cents)
     VALUES ($1, $2, '2026-01-05', NULL, 85000)`,
    [uuidv7(), MISSION],
  );
  await client.query(
    `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
     VALUES ($1, $4, $5, '2026-01-05', NULL), ($2, $4, $6, '2026-01-05', NULL),
            ($3, $7, $5, '2026-01-05', NULL)`,
    [uuidv7(), uuidv7(), uuidv7(), ALICE, MISSION, FORFAIT, CHLOE],
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
             'RCS Paris 732 829 320', '42 rue', '75008', 'Paris', 'France', 'PFT')`,
    [ENTITY],
  );

  // Alice's June: submitted, and carrying two days on a Forfait mission so that the validation
  // declines them (ADR-0037) and the blocking-reason column has something true to show.
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status, submitted_at)
     VALUES ($1, $2, $3, '2026-06', 'submitted', '2026-07-01T09:00:00Z')`,
    [CRA_VALIDATED, ALICE, PARIS],
  );
  const [firstDay = '', ...regieDays] = workedDaysOfJune();
  await client.query(
    `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, half_days)
     VALUES ($1, $2, $3, 'worked', $4, 2)`,
    [uuidv7(), CRA_VALIDATED, firstDay, FORFAIT],
  );
  for (const day of regieDays) {
    await client.query(
      `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, half_days)
       VALUES ($1, $2, $3, 'worked', $4, 2)`,
      [uuidv7(), CRA_VALIDATED, day, MISSION],
    );
  }

  // Chloé's June: still a draft when July opened. Nothing about it has reached billing, and its
  // days are what the late-days counter counts (ADR-0054).
  await client.query(
    `INSERT INTO timesheet.cras (id, consultant_id, office_id, period, status)
     VALUES ($1, $2, $3, '2026-06', 'draft')`,
    [CRA_SUBMITTED, CHLOE, PARIS],
  );
  await client.query(
    `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, half_days)
     VALUES ($1, $2, '2026-06-02', 'worked', $3, 2), ($4, $2, '2026-06-03', 'worked', $3, 1)`,
    [uuidv7(), CRA_SUBMITTED, MISSION, uuidv7()],
  );
});

afterEach(async () => {
  await app.close();
});

/** Validates Alice's June through the API, which is what puts a draft invoice on the screen. */
async function validateAliceJune(): Promise<void> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/cras/${CRA_VALIDATED}/validation`,
    headers: { ...as('manager-paris'), origin: ORIGIN },
  });

  expect(response.statusCode).toBe(200);
}

describe('the pré-facturier', () => {
  it('shows what is billable, with the totals the document will carry', async () => {
    await validateAliceJune();

    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('Banque Nationale de Test');
    // 21 workable days in June 2026 (the 1st is Pentecost Monday) minus the one worked on the
    // Forfait mission = 20 days at 850 € = 17 000 € HT, 20 400 € TTC at 20 %. The total is read
    // off the aggregate, not out of a SUM (ADR-0053): a draft's `total_ttc_cents` column is NULL,
    // so a shape that read the column would render "—" here rather than a number.
    // Through `frenchEuros` rather than as a literal: the thousands separator is U+202F, and a
    // test that spells it with an ordinary space asserts the wrong string for the right number.
    // What is asserted here is the cents; the formatting has its own tests.
    expect(response.body).toContain(frenchEuros(1_700_000));
    expect(response.body).toContain(frenchEuros(2_040_000));
  });

  it('names the blocking reason for the days that produced no line', async () => {
    await validateAliceJune();

    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('manager-paris'),
    });

    expect(response.body).toContain(LABELS.preFacturier.declineReasons.notRegie);
    expect(response.body).toContain('Refonte SOC');
  });

  it('counts the days of a closed month that no validation has reached', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('manager-paris'),
    });

    // Chloé's draft carries three half-days; Alice's is submitted and carries the whole month.
    // Both are late in July, and both are the consultant's or the manager's to move.
    expect(response.body).toContain(LABELS.preFacturier.awaitingConsultant);
    expect(response.body).toContain(LABELS.preFacturier.lateTag);
  });

  it('counts nothing late on the month still running', async () => {
    // July, with the clock in July: nothing recorded this month is due yet (ADR-0054), so the
    // counter is zero and the page says why rather than showing a bare zero.
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-07`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(LABELS.preFacturier.lateNoneYet);
  });

  it('shows a manager only their own office', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('manager-lyon'),
    });

    // Filtered, never refused — ADR-0003's first beat. Lyon has no Cra in June, so the page is
    // the empty state and not a 403, and it says as much rather than rendering an empty table.
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('Alice Martin');
    expect(response.body).toContain(LABELS.preFacturier.crasEmpty);
  });

  it('does not carry a Tjm, a Cjm or a margin anywhere in the page', async () => {
    await validateAliceJune();

    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('manager-paris'),
    });

    // 850 € is the Tjm and 420 € the Cjm. Asserted as the rendered strings rather than as absent
    // field names: the screen renders French amounts, and a leak would arrive looking like one.
    expect(response.body).not.toContain(frenchEuros(85_000));
    expect(response.body).not.toContain(frenchEuros(42_000));
  });

  it('is not reachable by a consultant: the role does not carry the action', async () => {
    const response = await app.inject({
      method: 'GET',
      url: PATHS.preFacturier,
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('/problems/insufficient-role');
  });
});

describe('the invoice as a printable document', () => {
  /** The draft the validation produced, reached the way the screen reaches it. */
  async function openTheInvoice(): Promise<string> {
    await validateAliceJune();

    const listed = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('manager-paris'),
    });
    const href = /\/facture\/[\w-]+/u.exec(listed.body)?.[0];
    expect(href).toBeDefined();

    const response = await app.inject({ method: 'GET', url: href!, headers: as('manager-paris') });
    expect(response.statusCode).toBe(200);

    return response.body;
  }

  it('carries the seller, the client, and the delivery address the reform makes mandatory', async () => {
    const body = await openTheInvoice();

    expect(body).toContain('SecureCo SAS');
    expect(body).toContain('732829320');
    expect(body).toContain('RCS Paris 732 829 320');
    expect(body).toContain('Banque Nationale de Test');
    expect(body).toContain('443061841');
    expect(body).toContain(LABELS.invoice.deliveryAddress);
  });

  it('carries every mandatory mention, from the model rather than from prose', async () => {
    const body = await openTheInvoice();

    // The four the chain's policy sets (`validate-cra.ts`), each rendered with its value filled in
    // from `LegalMentions`. The early-payment one is the tell: it is mandatory **even to say there
    // is none**, so its absence here would mean the model stopped carrying it.
    expect(body).toContain('15\u202f%');
    expect(body).toContain(frenchEuros(4000));
    expect(body).toContain(LABELS.invoice.noDiscount);
    expect(body).toContain(LABELS.invoice.vatOnCollection);
    expect(body).toContain(LABELS.invoice.operationCategories.services);
  });

  it('recapitulates VAT per rate, and the three totals agree with it', async () => {
    const body = await openTheInvoice();

    expect(body).toContain(LABELS.invoice.vatRecap);
    // 17 000 € HT at 20 % = 3 400 € of VAT, 20 400 € TTC. Rounded once over the grouped base, not
    // per line (ADR-0010) — which is the same arithmetic the pré-facturier showed.
    expect(body).toContain(frenchEuros(1_700_000));
    expect(body).toContain(frenchEuros(340_000));
    expect(body).toContain(frenchEuros(2_040_000));
  });

  it('prints the Cra each line came from — the piste d’audit fiable, on the document', async () => {
    const body = await openTheInvoice();

    expect(body).toContain(LABELS.invoice.origin);
    expect(body).toContain(CRA_VALIDATED);
  });

  it('says a draft is not an invoice, and shows it has neither number nor date', async () => {
    const body = await openTheInvoice();

    expect(body).toContain(LABELS.invoice.draftNotice);
    expect(body).toContain(LABELS.invoice.draftHeading);
    expect(body).not.toContain('PFT-2026-');
  });

  it('is not reachable by a consultant, whose days it is about', async () => {
    await validateAliceJune();

    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.invoice}/anything`,
      headers: as('consultant-paris'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('/problems/insufficient-role');
  });

  it('refuses a manager of another office, and does not answer 404 instead', async () => {
    await validateAliceJune();

    const listed = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('manager-paris'),
    });
    const href = /\/facture\/[\w-]+/u.exec(listed.body)?.[0] ?? '';

    const response = await app.inject({ method: 'GET', url: href, headers: as('manager-lyon') });

    // ADR-0003's second beat: the record exists and is refused by name, rather than being hidden
    // behind an absence that would say nothing about why.
    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('/problems/out-of-scope');
  });
});

describe('the reveal behind the pré-facturier', () => {
  it('serves the margin to a manager of the office, as a page', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.margin}/${ALICE}?periode=2026-06`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain(frenchEuros(42_000));
    expect(response.body).toContain(frenchEuros(85_000));
    expect(response.body).toContain(LABELS.margin.margin);
  });

  it('refuses a billing persona, and the page names the rule that refused', async () => {
    // The link is rendered for billing on the pré-facturier and the refusal happens here, which
    // is BUILD-PLAN's "the refusal reason shown, not a greyed-out button". `economics` is `none`
    // for this role (ADR-0023), so the route declaration refuses before any rate is read.
    const listed = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('billing-paris'),
    });
    expect(listed.body).toContain(`${PATHS.margin}/${ALICE}`);

    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.margin}/${ALICE}?periode=2026-06`,
      headers: as('billing-paris'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain(LABELS.problem.heading.denied);
    expect(response.body).toContain('/problems/insufficient-role');
    expect(response.body).not.toContain(frenchEuros(42_000));
  });

  it('refuses a manager of another office, and the page names the scope rule', async () => {
    // The claim this repository makes third, checked on HTML: "a manager in one office cannot
    // read the margin of a mission in another office". Reached by typing the URL, because the
    // list never offered it — which is exactly ADR-0003's second beat.
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.margin}/${ALICE}?periode=2026-06`,
      headers: as('manager-lyon'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain(LABELS.problem.heading.denied);
    expect(response.body).toContain('/problems/out-of-scope');
    expect(response.body).not.toContain(frenchEuros(42_000));
  });

  it('answers a month the consultant has no Cra for with an absence, not a refusal', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.margin}/${ALICE}?periode=2026-05`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(404);
    expect(response.body).toContain(LABELS.problem.heading.notFound);
  });
});
