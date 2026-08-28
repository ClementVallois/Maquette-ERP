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
 * The two printables that survive the pré-facturier's own screen (front-end plan Phase 9.3): the
 * invoice document and the Cra record, both reached from what used to be the pré-facturier's list
 * and both still server-rendered on purpose (ADR-0055, ADR-0056). The three write verbs behind
 * them — validate, refuse, issue — are POST-only now, kept for the same reason.
 *
 * The pré-facturier's own GET screen and the margin reveal behind it are gone: `apps/web`'s SPA
 * renders `/pre-facturier` and `/marge/$consultantId`, and reads `GET /api/v1/pre-facturier` and
 * `GET /api/v1/consultants/:id/economics` for the data — `apps/api/src/routes/pre-facturier.int.test.ts`
 * and `apps/api/src/routes/api.int.test.ts`'s "the progressive-disclosure read" cover what those
 * two screens' own tests used to (two facts moved there rather than being dropped: "nothing late
 * on the month still running", and "a month with no Cra answers absence, not refusal").
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

/**
 * Validates Alice's June through the API, which is what drafts the invoice, and returns its id.
 *
 * The id used to be scraped out of the pré-facturier list's rendered HTML (`/\/facture\/[\w-]+/u`
 * against the page body) — that page is gone since Phase 9.3, and the validation response already
 * carries the same id (`InvoiceListItem.id`, `apps/api/src/routes/api.ts`'s `POST
 * /api/v1/cras/:id/validation`), one HTTP call earlier than the scrape ever needed it.
 */
async function validateAliceJune(): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/cras/${CRA_VALIDATED}/validation`,
    headers: { ...as('manager-paris'), origin: ORIGIN },
  });

  expect(response.statusCode).toBe(200);
  const { invoices } = response.json<{ invoices: { id: string }[] }>();
  expect(invoices).toHaveLength(1);

  return invoices[0]!.id;
}

describe('the invoice as a printable document', () => {
  /** The draft the validation produced, at the address the SPA links to it by. */
  async function openTheInvoice(): Promise<string> {
    const id = await validateAliceJune();

    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.invoice}/${id}`,
      headers: as('manager-paris'),
    });
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
    const id = await validateAliceJune();

    const response = await app.inject({
      method: 'GET',
      url: `${PATHS.invoice}/${id}`,
      headers: as('manager-lyon'),
    });

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
 * carries a `title`. `accessibility.test.ts` proves them on fixtures it builds without a database;
 * the two printables need one, so the same two assertions run here on their rendered bodies.
 *
 * "All four" until Phase 9.3: the pré-facturier list and the margin reveal were the other two, and
 * they are `apps/web`'s screens now. The pré-facturier is re-covered by `apps/web/e2e/axe.spec.ts`
 * (a real browser, a stronger claim than this string match). The margin screen is **not** — it is
 * visited by `journeys.spec.ts` only, so ADR-0061's two claims lost their mechanical gate there;
 * `docs/open-questions.md` carries that row, for Phase 10.
 */
function assertMechanicalAccessibility(body: string): void {
  // `(?=[\\s>])` so the lookahead does not read `<thead>` as an unscoped `<th>`.
  expect([...body.matchAll(/<th(?=[\s>])(?![^>]*scope=)[^>]*>/gu)]).toStrictEqual([]);
  expect(body).not.toMatch(/<[a-z][^>]*\stitle="/u);
}

describe('the pages ADR-0061 claims about, and only a database can render', () => {
  it('scopes every table header and carries no title, on both printables', async () => {
    const id = await validateAliceJune();

    for (const url of [`${PATHS.invoice}/${id}`, `${PATHS.craPrint}/${CRA_VALIDATED}`]) {
      const response = await app.inject({ method: 'GET', url, headers: as('manager-paris') });
      expect(response.statusCode).toBe(200);
      assertMechanicalAccessibility(response.body);
    }
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
    // `period`, not `periode`: the form field this verb reads is French (ADR-0026), the search
    // param of the SPA route it redirects *to* is English (task 7.1), and `backToPreFacturier`
    // translates between them. Sending `periode` would land the SPA on its own default month.
    expect(validated.headers.location).toBe(`${PATHS.preFacturier}?period=2026-06`);

    // "And the invoice appears" — read where the SPA reads it, the pré-facturier screen this
    // file used to render being `apps/web`'s since Phase 9.3.
    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/pre-facturier?period=2026-06',
      headers: as('manager-paris'),
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json<{ summary: { billableCents: number } }>().summary.billableCents).toBe(
      1_700_000,
    );
  });

  it('lets the manager refuse it with a reason, and the consultant sees the reason', async () => {
    const refused = await app.inject({
      method: 'POST',
      url: `${PATHS.refuseCra}/${CRA_VALIDATED}`,
      headers: posting('manager-paris'),
      payload: 'reason=le+12+est+une+mission+termin%C3%A9e&periode=2026-06',
    });

    expect(refused.statusCode).toBe(303);
    expect(refused.headers.location).toBe(`${PATHS.preFacturier}?period=2026-06`);

    // The consultant's grid is `apps/web`'s screen since Phase 9.3, so the reason is read from
    // the endpoint it renders — the same `craGridComposition` the deleted screen composed, one
    // representation later. That the SPA then *shows* it is `journeys.spec.ts`'s J2.
    const grid = await app.inject({
      method: 'GET',
      url: '/api/v1/cras/2026-06/grid',
      headers: as('consultant-paris'),
    });
    expect(grid.statusCode).toBe(200);
    const body = grid.json<{ status: string; refusal: { reason: string } | null }>();
    expect(body.status).toBe('refused');
    expect(body.refusal?.reason).toBe('le 12 est une mission terminée');
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

  it('refuses billing the decision, whatever the screen offered it', async () => {
    // The offer half of this test moved with the screen: `decidable` on `GET
    // /api/v1/pre-facturier` is what the SPA renders a button from, and
    // `routes/pre-facturier.int.test.ts` asserts it is false for billing. What stays here is the
    // half that was always the control — the absence of a button never was one. The route is.
    const posted = await app.inject({
      method: 'POST',
      url: `${PATHS.validateCra}/${CRA_VALIDATED}`,
      headers: posting('billing-paris'),
    });
    expect(posted.statusCode).toBe(403);
    expect(posted.body).toContain('/problems/insufficient-role');
  });

  it('issues the invoice from the page, carrying the key in a hidden field', async () => {
    const id = await validateAliceJune();
    const href = `${PATHS.invoice}/${id}`;

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
    const id = await validateAliceJune();
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
    const id = await validateAliceJune();

    const page = await app.inject({
      method: 'GET',
      url: `${PATHS.invoice}/${id}`,
      headers: as('manager-paris'),
    });
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

/*
 * `describe('the reveal behind the pré-facturier')` stood here until Phase 9.3, and is deleted
 * rather than moved: `/marge/:consultantId` was a rendered page and is now `apps/web`'s screen,
 * reading `GET /api/v1/consultants/:consultantId/economics`. Its four claims were checked against
 * that route before the deletion, and each one already had a test there — "the progressive-
 * disclosure read" in `apps/api/src/routes/api.int.test.ts`: the margin served to a manager of the
 * office, the 403 `insufficient-role` for billing (`economics: 'none'`, ADR-0023), the 403
 * `out-of-scope` for a manager of another office (the repository's third claim, and the one
 * BUILD-RULES names), and — the one fact that had no equivalent and was moved rather than found —
 * a month with no Cra answering 404 and not a refusal.
 *
 * What is lost with the page is only the rendering: that the refusal is a **page** naming the rule
 * is still asserted in this file (the invoice document, above) and in `states.int.test.ts`, so no
 * claim of ADR-0052 or ADR-0003 rests on a test that no longer exists. The SPA's own rendering of
 * the same two refusals is `apps/web/e2e/journeys.spec.ts` (task 7.6's deep-linked 403).
 */
