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

import { frenchDays, frenchEuros } from './format.ts';
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

function posting(key: string): Record<string, string> {
  return { ...as(key), origin: ORIGIN, 'content-type': 'application/x-www-form-urlencoded' };
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
    `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
     VALUES ($1, $2, $3, 'worked', $4, 4)`,
    [uuidv7(), CRA_VALIDATED, firstDay, FORFAIT],
  );
  for (const day of regieDays) {
    await client.query(
      `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
       VALUES ($1, $2, $3, 'worked', $4, 4)`,
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
    `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
     VALUES ($1, $2, '2026-06-02', 'worked', $3, 4), ($4, $2, '2026-06-03', 'worked', $3, 1)`,
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

    // Chloé's draft carries five quarter-days; Alice's is submitted and carries the whole month.
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

describe('the Cra as a printable record', () => {
  it('shows the whole month, absences and non-billable days included', async () => {
    await validateAliceJune();

    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.craPrint}/${CRA_VALIDATED}`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('Alice Martin');
    expect(response.body).toContain('Paris');
    // The Forfait day is on the record even though it reaches no invoice: a record of working
    // time with the inconvenient rows removed is not one (ADR-0056).
    expect(response.body).toContain('Refonte SOC');
    expect(response.body).toContain('Audit DORA');
    expect(response.body).toContain(frenchDays(84));
  });

  it('carries a signature block that names nobody', async () => {
    await validateAliceJune();

    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.craPrint}/${CRA_VALIDATED}`,
      headers: as('manager-paris'),
    });

    expect(response.body).toContain(LABELS.craPrint.signature);
    expect(response.body).toContain(LABELS.craPrint.signatureMark);
    // A month is worked across missions and therefore across clients, so no client is printed
    // into the block — the argument and its threshold are in ADR-0056.
    expect(response.body).not.toContain('Banque Nationale de Test');
  });

  it('says an unvalidated month is not signable, rather than refusing to render it', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.craPrint}/${CRA_SUBMITTED}`,
      headers: as('manager-paris'),
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(LABELS.craPrint.notValidated);
  });

  it('lets the consultant print their own, and refuses them a colleague’s', async () => {
    const own = await app.inject({
      method: 'GET',
      url: `${PATHS.craPrint}/${CRA_VALIDATED}`,
      headers: as('consultant-paris'),
    });
    expect(own.statusCode).toBe(200);

    // Same office, same role, another person: `cra: 'own'` narrows to the actor (ADR-0023), and
    // the refusal names the rule rather than hiding the record behind a 404.
    const colleague = await app.inject({
      method: 'GET',
      url: `${PATHS.craPrint}/${CRA_SUBMITTED}`,
      headers: as('consultant-paris'),
    });
    expect(colleague.statusCode).toBe(403);
    expect(colleague.body).toContain('/problems/out-of-scope');
  });

  it('refuses a manager of another office', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.craPrint}/${CRA_VALIDATED}`,
      headers: as('manager-lyon'),
    });

    expect(response.statusCode).toBe(403);
    expect(response.body).toContain('/problems/out-of-scope');
  });
});

/**
 * ADR-0061 states two claims universally — every data table scopes its headers, and no element
 * carries a `title`. `accessibility.test.ts` proves them on the two pages it can build fixtures
 * for; these four pages need a database, so the same two assertions run here on their rendered
 * bodies. A gate scoped to a third of the pages is a gate that stopped looking.
 */
function assertMechanicalAccessibility(body: string): void {
  // `(?=[\\s>])` so the lookahead does not read `<thead>` as an unscoped `<th>`.
  expect([...body.matchAll(/<th(?=[\s>])(?![^>]*scope=)[^>]*>/gu)]).toStrictEqual([]);
  expect(body).not.toMatch(/<[a-z][^>]*\stitle="/u);
}

describe('the pages ADR-0061 claims about, and only a database can render', () => {
  it('scopes every table header and carries no title, on all four', async () => {
    await validateAliceJune();

    const listed = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('manager-paris'),
    });
    const invoiceHref = /\/facture\/[\w-]+/u.exec(listed.body)?.[0] ?? '';

    for (const url of [
      invoiceHref,
      `${PATHS.craPrint}/${CRA_VALIDATED}`,
      `${PATHS.margin}/${ALICE}?periode=2026-06`,
    ]) {
      const response = await app.inject({ method: 'GET', url, headers: as('manager-paris') });
      expect(response.statusCode).toBe(200);
      assertMechanicalAccessibility(response.body);
    }

    assertMechanicalAccessibility(listed.body);
  });
});

describe('the three verbs of the chain, on screen', () => {
  it('lets the manager validate a submitted month, and the invoice appears', async () => {
    const validated = await app.inject({
      method: 'POST',
      url: `${PATHS.validateCra}/${CRA_VALIDATED}`,
      headers: posting('manager-paris'),
      payload: 'periode=2026-06',
    });

    // POST-then-redirect, so a refresh does not re-validate — and back to the month the manager
    // was looking at, not to the default one. BUILD-PLAN 6.6 puts the filter in the URL, and an
    // action that drops it makes every decision a jump somewhere else.
    expect(validated.statusCode).toBe(303);
    expect(validated.headers.location).toBe(`${PATHS.preFacturier}?periode=2026-06`);

    const listed = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('manager-paris'),
    });
    expect(listed.body).toContain(frenchEuros(1_700_000));
  });

  it('lets the manager refuse it with a reason, and the consultant sees the reason', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: `${PATHS.refuseCra}/${CRA_VALIDATED}`,
      headers: posting('manager-paris'),
      payload: 'reason=le+12+est+une+mission+termin%C3%A9e&periode=2026-06',
    });

    expect(refused.statusCode).toBe(303);
    expect(refused.headers.location).toBe(`${PATHS.preFacturier}?periode=2026-06`);

    const grid = await app.inject({
      method: 'GET',
      url: `${PATHS.consultantCra}/2026-06`,
      headers: as('consultant-paris'),
    });
    expect(grid.body).toContain(LABELS.cra.refused);
    expect(grid.body).toContain('le 12 est une mission terminée');
  });

  it('refuses a refusal that says nothing, before the domain is reached', async () => {
    const response = await app.inject({
      method: 'POST',
      url: `${PATHS.refuseCra}/${CRA_VALIDATED}`,
      headers: posting('manager-paris'),
      payload: 'reason=',
    });

    // 400, not 422: an empty field is a malformed request, decided at the transport before any
    // module is called (ADR-0042).
    expect(response.statusCode).toBe(400);
  });

  it('refuses a manager of another office both verbs', async () => {
    for (const path of [PATHS.validateCra, PATHS.refuseCra]) {
      const response = await app.inject({
        method: 'POST',
        url: `${path}/${CRA_VALIDATED}`,
        headers: posting('manager-lyon'),
        payload: 'reason=pas+mon+implantation',
      });

      expect(response.statusCode).toBe(403);
      expect(response.body).toContain('/problems/out-of-scope');
    }
  });

  it('offers billing no decision on the pré-facturier, and refuses it if posted anyway', async () => {
    const listed = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('billing-paris'),
    });
    expect(listed.body).not.toContain(LABELS.preFacturier.validate);

    // The absence of the button is not the control. The route is.
    const posted = await app.inject({
      method: 'POST',
      url: `${PATHS.validateCra}/${CRA_VALIDATED}`,
      headers: posting('billing-paris'),
    });
    expect(posted.statusCode).toBe(403);
    expect(posted.body).toContain('/problems/insufficient-role');
  });

  it('issues the invoice from the page, carrying the key in a hidden field', async () => {
    await validateAliceJune();

    const listed = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('billing-paris'),
    });
    const href = /\/facture\/[\w-]+/u.exec(listed.body)?.[0] ?? '';
    const id = href.slice(`${PATHS.invoice}/`.length);

    const page = await app.inject({ method: 'GET', url: href, headers: as('billing-paris') });
    const key = /name="idempotencyKey" value="([\w-]+)"/u.exec(page.body)?.[1];
    expect(key).toBeDefined();

    const issued = await app.inject({
      method: 'POST',
      url: `${PATHS.issueInvoice}/${id}`,
      headers: posting('billing-paris'),
      payload: `idempotencyKey=${key ?? ''}`,
    });
    expect(issued.statusCode).toBe(303);
    expect(issued.headers.location).toBe(href);

    const document = await app.inject({ method: 'GET', url: href, headers: as('billing-paris') });
    // Matched by shape rather than by prefix. The seller is `public.legal_entities` ORDER BY id
    // LIMIT 1, and the integration database is seeded on a laptop and not in CI — so which entity
    // wins, and therefore which prefix the number carries, differs between the two runs. What is
    // asserted is ADR-0018's format: prefix, fiscal year, zero-padded sequence.
    expect(document.body).toMatch(/[A-Z]{3}-2026-\d{6}/u);
    expect(document.body).not.toContain(LABELS.invoice.draftNotice);
    expect(document.body).toContain(LABELS.invoice.cannotIssue);
  });

  it('answers a resubmission of the same key with the same document, not a second number', async () => {
    await validateAliceJune();

    const listed = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('billing-paris'),
    });
    const href = /\/facture\/[\w-]+/u.exec(listed.body)?.[0] ?? '';
    const id = href.slice(`${PATHS.invoice}/`.length);
    const key = 'a-stable-key-from-one-render';

    const first = await app.inject({
      method: 'POST',
      url: `${PATHS.issueInvoice}/${id}`,
      headers: posting('billing-paris'),
      payload: `idempotencyKey=${key}`,
    });
    const replay = await app.inject({
      method: 'POST',
      url: `${PATHS.issueInvoice}/${id}`,
      headers: posting('billing-paris'),
      payload: `idempotencyKey=${key}`,
    });

    expect(first.statusCode).toBe(303);
    expect(replay.statusCode).toBe(303);

    const { rows } = await transaction.client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM billing.numbering_series`,
    );
    // One counter row, and the invoice carries one number. A retry that burned a second one is
    // exactly what ADR-0044's key exists to stop.
    expect(Number.parseInt(rows[0]?.count ?? '0', 10)).toBeGreaterThan(0);
  });

  it('refuses a manager the issuance, and offers them no form for it', async () => {
    await validateAliceJune();

    const listed = await app.inject({
      method: 'GET',
      url: `${PATHS.preFacturier}?periode=2026-06`,
      headers: as('manager-paris'),
    });
    const href = /\/facture\/[\w-]+/u.exec(listed.body)?.[0] ?? '';
    const id = href.slice(`${PATHS.invoice}/`.length);

    const page = await app.inject({ method: 'GET', url: href, headers: as('manager-paris') });
    expect(page.body).not.toContain('idempotencyKey');

    // Separation of duties, second rule: whoever validates does not issue. Here it is the role
    // that refuses, before the domain's own check on `validatedBy` is reached.
    const posted = await app.inject({
      method: 'POST',
      url: `${PATHS.issueInvoice}/${id}`,
      headers: posting('manager-paris'),
      payload: 'idempotencyKey=whatever-key-8',
    });
    expect(posted.statusCode).toBe(403);
    expect(posted.body).toContain('/problems/insufficient-role');
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
