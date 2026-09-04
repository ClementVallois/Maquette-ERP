/**
 * The deterministic dataset (ADR-0022). Every identifier, every name, every rate is literal: the
 * same script produces the same database on every machine, every time. No real name, no real rate.
 *
 * Shape fixed by CLAUDE.md: 5 practices · 4 offices · Regie AND Forfait missions (only Regie
 * invoiced) · one Intercontrat consultant · one PASSI Habilitation constraining an assignment ·
 * Réunion client at 8.5 % · EU B2B client under Autoliquidation · Guyane client outside VAT scope ·
 * Grade carrying the default Tjm grid · Cjm as the sensitive value the scope test protects.
 *
 * Item 6 (QA round 1) added volume on top of that shape, further down this file: 40 more
 * consultants and two more managers, none of them in `personas`; dense Cras for June, July and
 * August 2026; four veterans carrying a sparse history back to 2016, one of whom has left the
 * firm; and invoices from 2016 in three statuses. The nine named individuals above are unchanged.
 * (The second of those two managers, Rennes' own, exists so that no consultant is attached to a
 * manager in another office — ADR-0094, and `managerAttachments` below.)
 */

import { deterministicIdFactory } from '@erp/api';
import { TechnicalFailure } from '@erp/platform';

// A frozen timestamp for the whole dataset: 2026-06-15T00:00:00.000Z.
// Arbitrary but stable: every UUIDv7 in the seed shares this prefix.
const SEED_TIMESTAMP_MS = Date.UTC(2026, 5, 15);

const ids = deterministicIdFactory(SEED_TIMESTAMP_MS);

// ── Offices ─────────────────────────────────────────────────────────────────

export const offices = [
  { id: ids.next(), name: 'Paris', city: 'Paris' },
  { id: ids.next(), name: 'Lyon', city: 'Lyon' },
  { id: ids.next(), name: 'Rennes', city: 'Rennes' },
  { id: ids.next(), name: 'Bordeaux', city: 'Bordeaux' },
] as const;

const [paris, lyon, rennes, bordeaux] = offices;

// ── Practices ───────────────────────────────────────────────────────────────

export const practices = [
  { id: ids.next(), name: 'Audit' },
  { id: ids.next(), name: 'SOC' },
  { id: ids.next(), name: 'GRC' },
  { id: ids.next(), name: 'IAM' },
  { id: ids.next(), name: 'Offensive Security' },
] as const;

const [audit, soc, grc, iam, offensive] = practices;

// ── Grades ───────────────────────────────────────────────────────────────────

export const grades = [
  { id: ids.next(), name: 'Consultant Junior', rank: 1 },
  { id: ids.next(), name: 'Consultant Confirmé', rank: 2 },
  { id: ids.next(), name: 'Consultant Senior', rank: 3 },
  { id: ids.next(), name: 'Manager', rank: 4 },
] as const;

const [gradeJunior, gradeConfirme, gradeSenior, gradeManager] = grades;

// ── Habilitations ───────────────────────────────────────────────────────────

export const habilitations = [{ id: ids.next(), name: 'PASSI' }] as const;

const [passi] = habilitations;

// ── Legal entity (the firm issuing invoices) ────────────────────────────────

export const legalEntityData = {
  id: ids.next(),
  name: 'SecureCo SAS',
  legalForm: 'SAS',
  shareCapitalCents: 10000000, // 100 000 €
  siren: '732829320',
  intraCommunityVatNumber: 'FR27732829320',
  rcsRegistration: 'RCS Paris 732 829 320',
  address: {
    line1: '42 rue de la Cybersécurité',
    line2: null,
    postalCode: '75008',
    city: 'Paris',
    country: 'France',
  },
  numberPrefix: 'SEC',
} as const;

// ── Consultants ─────────────────────────────────────────────────────────────
// Roles: consultant, manager, director

const originalConsultants = [
  // Paris — audit practice
  {
    id: ids.next(),
    firstName: 'Alice',
    lastName: 'Martin',
    email: 'alice.martin@secureco.test',
    officeId: paris.id,
    practiceId: audit.id,
    role: 'consultant' as const,
  },
  {
    id: ids.next(),
    firstName: 'Bruno',
    lastName: 'Leroy',
    email: 'bruno.leroy@secureco.test',
    officeId: paris.id,
    practiceId: audit.id,
    role: 'manager' as const,
  },
  // Paris — SOC practice
  {
    id: ids.next(),
    firstName: 'Claire',
    lastName: 'Dubois',
    email: 'claire.dubois@secureco.test',
    officeId: paris.id,
    practiceId: soc.id,
    role: 'consultant' as const,
  },
  // Lyon — GRC practice
  {
    id: ids.next(),
    firstName: 'David',
    lastName: 'Bernard',
    email: 'david.bernard@secureco.test',
    officeId: lyon.id,
    practiceId: grc.id,
    role: 'consultant' as const,
  },
  {
    id: ids.next(),
    firstName: 'Emma',
    lastName: 'Robert',
    email: 'emma.robert@secureco.test',
    officeId: lyon.id,
    practiceId: grc.id,
    role: 'manager' as const,
  },
  // Rennes — IAM practice
  {
    id: ids.next(),
    firstName: 'François',
    lastName: 'Moreau',
    email: 'francois.moreau@secureco.test',
    officeId: rennes.id,
    practiceId: iam.id,
    role: 'consultant' as const,
  },
  // Bordeaux — offensive security
  {
    id: ids.next(),
    firstName: 'Gabrielle',
    lastName: 'Petit',
    email: 'gabrielle.petit@secureco.test',
    officeId: bordeaux.id,
    practiceId: offensive.id,
    role: 'consultant' as const,
  },
  // Paris — director
  {
    id: ids.next(),
    firstName: 'Henri',
    lastName: 'Laurent',
    email: 'henri.laurent@secureco.test',
    officeId: paris.id,
    practiceId: audit.id,
    role: 'director' as const,
  },
  // Lyon — Intercontrat consultant (bench)
  {
    id: ids.next(),
    firstName: 'Inès',
    lastName: 'Garcia',
    email: 'ines.garcia@secureco.test',
    officeId: lyon.id,
    practiceId: grc.id,
    role: 'consultant' as const,
  },
] as const;

const [alice, bruno, claire, david, emma, francois, gabrielle, henri, ines] = originalConsultants;

// ── Roster expansion (item 6, QA round 1) ───────────────────────────────────
//
// Wave 2 plan step 4 (`docs/open-questions.md`): each manager needs 10+ consultants, dense
// 2026-06/07/08 for every active one, sparse history to 2016 for a subset of veterans, at least
// one departure, and more managers — all NOT selectable (`personas` stays exactly four entries,
// ADR-0023). Every name below is synthetic (ADR-0022: no real name, no real rate), built by a
// small deterministic generator — a fixed pool indexed by counter, never `Math.random()` — so
// `pnpm run seed:fingerprint` stays reproducible.
//
// `ids.next()` is positional (the trap named in the brief): this block sits textually **after**
// `originalConsultants` and **before** `consultantGrades`/`gradeTjmDefaults`/etc., so every id it
// mints lands after the original nine and before any downstream array's own ids — nothing already
// bound (`alice`, `bruno`, …) shifts, and nothing after this block renumbers.

/** Strips diacritics for an ASCII-safe `@secureco.test` local part -- `Théo` -> `theo`. */
function asciiSlug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase();
}

function emailOf(firstName: string, lastName: string): string {
  return `${asciiSlug(firstName)}.${asciiSlug(lastName)}@secureco.test`;
}

/** Thrown only if a pool this file itself sizes turns out too small -- a defensive check
 * `noUncheckedIndexedAccess` requires the code to make, never expected to actually fire.
 * Technical rather than business, and not retryable: re-running the seed cannot make a literal
 * array longer (BUILD-RULES: an error is business or technical, never a bare `Error`). */
class RosterPoolExhaustedError extends TechnicalFailure {
  readonly retryable = false;
}

function cyclic<T>(pool: readonly T[], index: number): T {
  const value = pool[index % pool.length];
  if (value === undefined) {
    throw new RosterPoolExhaustedError(`empty roster pool at index ${String(index)}`);
  }
  return value;
}

interface RosterConsultant {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly officeId: string;
  readonly practiceId: string;
  readonly role: 'consultant' | 'manager';
  readonly departureDate: string | null;
}

// The four veterans/departure and the two new managers, named individually rather than pulled
// from a pool: each carries its own office/practice/role/departure, so a shared generator would
// need as much per-entry configuration as writing them out plainly does.

/** Paris veteran, active -- historical Cra on `mAuditDora`, still on staff through 2026. */
const julien: RosterConsultant = {
  id: ids.next(),
  firstName: 'Julien',
  lastName: 'Fabre',
  email: emailOf('Julien', 'Fabre'),
  officeId: paris.id,
  practiceId: audit.id,
  role: 'consultant',
  departureDate: null,
};
/** Paris veteran who **left** -- the departure ADR-0079's invariant asks the seed to exercise. */
const marine: RosterConsultant = {
  id: ids.next(),
  firstName: 'Marine',
  lastName: 'Girard',
  email: emailOf('Marine', 'Girard'),
  officeId: paris.id,
  practiceId: audit.id,
  role: 'consultant',
  departureDate: '2022-12-31',
};
/** Lyon veteran, active -- historical Cra on `mSocReunion`. */
const camille: RosterConsultant = {
  id: ids.next(),
  firstName: 'Camille',
  lastName: 'Roche',
  email: emailOf('Camille', 'Roche'),
  officeId: lyon.id,
  practiceId: soc.id,
  role: 'consultant',
  departureDate: null,
};
/** Bordeaux veteran, active -- historical Cra on `mGrcGuyane`. */
const theo: RosterConsultant = {
  id: ids.next(),
  firstName: 'Théo',
  lastName: 'Dubreuil',
  email: emailOf('Théo', 'Dubreuil'),
  officeId: bordeaux.id,
  practiceId: grc.id,
  role: 'consultant',
  departureDate: null,
};
/** A second, non-selectable manager -- Bordeaux gets its own local management line, the way Paris
 * (Bruno) and Lyon (Emma) already do. Reports to Henri, same as Bruno/Emma. */
const karim: RosterConsultant = {
  id: ids.next(),
  firstName: 'Karim',
  lastName: 'Faure',
  email: emailOf('Karim', 'Faure'),
  officeId: bordeaux.id,
  practiceId: offensive.id,
  role: 'manager',
  departureDate: null,
};
/** A third, non-selectable manager -- Rennes gets its own local management line the same way
 * Bordeaux (Karim) does, so François is not attached to a manager outside his own office
 * (ADR-0094). Reports to Henri, same as Bruno/Emma/Karim. */
const thomas: RosterConsultant = {
  id: ids.next(),
  firstName: 'Thomas',
  lastName: 'Lemoine',
  email: emailOf('Thomas', 'Lemoine'),
  officeId: rennes.id,
  practiceId: iam.id,
  role: 'manager',
  departureDate: null,
};

/** 34 names, one per filler consultant, never reused -- `(firstName, lastName)` is unique by
 * construction rather than by checking. */
const FILLER_NAME_POOL: readonly { readonly firstName: string; readonly lastName: string }[] = [
  { firstName: 'Léa', lastName: 'Chevalier' },
  { firstName: 'Antoine', lastName: 'Perrin' },
  { firstName: 'Sophie', lastName: 'Gauthier' },
  { firstName: 'Nicolas', lastName: 'Aubert' },
  { firstName: 'Chloé', lastName: 'Fontaine' },
  { firstName: 'Maxime', lastName: 'Rousseau' },
  { firstName: 'Élise', lastName: 'Blanchard' },
  { firstName: 'Romain', lastName: 'Guérin' },
  { firstName: 'Pauline', lastName: 'Boyer' },
  { firstName: 'Hugo', lastName: 'Renard' },
  { firstName: 'Manon', lastName: 'Fournier' },
  { firstName: 'Simon', lastName: 'Lambert' },
  { firstName: 'Aurélie', lastName: 'Barbier' },
  { firstName: 'Thibault', lastName: 'Rolland' },
  { firstName: 'Charlotte', lastName: 'Masson' },
  { firstName: 'Lucas', lastName: 'Michel' },
  { firstName: 'Margaux', lastName: 'Colin' },
  { firstName: 'Adrien', lastName: 'Vidal' },
  { firstName: 'Céline', lastName: 'Caron' },
  { firstName: 'Baptiste', lastName: 'Meunier' },
  { firstName: 'Laurie', lastName: 'Lacroix' },
  { firstName: 'Victor', lastName: 'Roy' },
  { firstName: 'Anaïs', lastName: 'Noël' },
  { firstName: 'Florian', lastName: 'Meyer' },
  { firstName: 'Justine', lastName: 'Simoneau' },
  { firstName: 'Mehdi', lastName: 'Denis' },
  { firstName: 'Océane', lastName: 'Marchand' },
  { firstName: 'Bastien', lastName: 'Lemoine' },
  { firstName: 'Delphine', lastName: 'Dumas' },
  { firstName: 'Yanis', lastName: 'Legrand' },
  { firstName: 'Alexia', lastName: 'Brun' },
  { firstName: 'Kevin', lastName: 'Picard' },
  { firstName: 'Solène', lastName: 'Charpentier' },
  { firstName: 'Damien', lastName: 'Riviere' },
] as const;

const rosterPractices = [audit, soc, grc, iam, offensive] as const;

/** Regie fillers exist to give managers more than a bench roster; the rest sit on the internal
 * `Intercontrat` mission (ADR-0046) -- realistic for a firm that is not staffed at 100%, and it
 * bounds how many draft invoices the dense months produce (each Regie validation drafts one). */
const PARIS_REGIE_FILLER_COUNT = 4;
const LYON_REGIE_FILLER_COUNT = 4;
const BORDEAUX_REGIE_FILLER_COUNT = 1;

/** Paris fillers, reporting to Bruno -- brings his roster to 3 + 16 = 19. */
const PARIS_FILLER_COUNT = 16;
/** Lyon fillers, reporting to Emma -- brings her roster to 3 + 16 = 19. */
const LYON_FILLER_COUNT = 16;
/** Bordeaux fillers, reporting to Karim -- depth for the new line, not a floor to clear (only the
 * two selectable managers, Bruno and Emma, owe the "10 consultants" floor). */
const BORDEAUX_FILLER_COUNT = 2;

function fillerRoster(
  count: number,
  poolStart: number,
  officeId: string,
): readonly RosterConsultant[] {
  return FILLER_NAME_POOL.slice(poolStart, poolStart + count).map((name, i) => ({
    id: ids.next(),
    firstName: name.firstName,
    lastName: name.lastName,
    email: emailOf(name.firstName, name.lastName),
    officeId,
    practiceId: cyclic(rosterPractices, poolStart + i).id,
    role: 'consultant' as const,
    departureDate: null,
  }));
}

const parisFillers = fillerRoster(PARIS_FILLER_COUNT, 0, paris.id);
const lyonFillers = fillerRoster(LYON_FILLER_COUNT, PARIS_FILLER_COUNT, lyon.id);
const bordeauxFillers = fillerRoster(
  BORDEAUX_FILLER_COUNT,
  PARIS_FILLER_COUNT + LYON_FILLER_COUNT,
  bordeaux.id,
);

const rosterConsultants: readonly RosterConsultant[] = [
  julien,
  marine,
  camille,
  theo,
  karim,
  thomas,
  ...parisFillers,
  ...lyonFillers,
  ...bordeauxFillers,
];

export const consultants = [
  ...originalConsultants.map((c) => ({ ...c, departureDate: null as string | null })),
  ...rosterConsultants,
] as const;

// ── Consultant grades (with Cjm — the sensitive value) ──────────────────────
// Cjm = cost per day, in integer cents. A whole number of euros, like Tjm.

export const consultantGrades = [
  {
    id: ids.next(),
    consultantId: alice.id,
    gradeId: gradeConfirme.id,
    fromDate: '2024-01-01',
    toDate: null,
    cjmCents: 25000,
  }, // 250 €/j
  {
    id: ids.next(),
    consultantId: bruno.id,
    gradeId: gradeManager.id,
    fromDate: '2023-01-01',
    toDate: null,
    cjmCents: 40000,
  }, // 400 €/j
  {
    id: ids.next(),
    consultantId: claire.id,
    gradeId: gradeJunior.id,
    fromDate: '2025-01-01',
    toDate: null,
    cjmCents: 20000,
  }, // 200 €/j
  {
    id: ids.next(),
    consultantId: david.id,
    gradeId: gradeConfirme.id,
    fromDate: '2024-01-01',
    toDate: null,
    cjmCents: 27000,
  }, // 270 €/j
  {
    id: ids.next(),
    consultantId: emma.id,
    gradeId: gradeManager.id,
    fromDate: '2023-06-01',
    toDate: null,
    cjmCents: 38000,
  }, // 380 €/j
  {
    id: ids.next(),
    consultantId: francois.id,
    gradeId: gradeSenior.id,
    fromDate: '2023-01-01',
    toDate: null,
    cjmCents: 32000,
  }, // 320 €/j
  {
    id: ids.next(),
    consultantId: gabrielle.id,
    gradeId: gradeConfirme.id,
    fromDate: '2024-06-01',
    toDate: null,
    cjmCents: 28000,
  }, // 280 €/j
  {
    id: ids.next(),
    consultantId: henri.id,
    gradeId: gradeManager.id,
    fromDate: '2020-01-01',
    toDate: null,
    cjmCents: 45000,
  }, // 450 €/j
  {
    id: ids.next(),
    consultantId: ines.id,
    gradeId: gradeJunior.id,
    fromDate: '2026-01-01',
    toDate: null,
    cjmCents: 19000,
  }, // 190 €/j
  // Roster expansion (item 6, QA round 1; ADR-0094 added the second manager): one grade per
  // new consultant, cycling Junior/Confirmé/Senior (a manager gets the Manager grade instead).
  // `fromDate` matches each roster member's own join date — 2016 for the four veterans and for
  // each manager, 2025 for every dense-only filler (a year of margin before the earliest 2026
  // CRA).
  ...rosterConsultants.map((c, index) => {
    const isVeteran = index < 4; // julien, marine, camille, theo
    const isManager = c.role === 'manager'; // karim, thomas
    const grade = isManager
      ? gradeManager
      : cyclic([gradeJunior, gradeConfirme, gradeSenior] as const, index);
    const fromDate = isVeteran || isManager ? '2016-01-01' : '2025-01-01';
    const cjmBase = isManager ? 39000 : cyclic([21000, 26000, 31000] as const, index);
    return {
      id: ids.next(),
      consultantId: c.id,
      gradeId: grade.id,
      fromDate,
      toDate: null,
      cjmCents: cjmBase + (index % 5) * 500,
    };
  }),
] as const;

// ── Grade Tjm defaults (the starting-point Tjm per grade) ───────────────────

export const gradeTjmDefaults = [
  {
    id: ids.next(),
    gradeId: gradeJunior.id,
    fromDate: '2024-01-01',
    toDate: null,
    tjmCents: 55000,
  }, // 550 €/j
  {
    id: ids.next(),
    gradeId: gradeConfirme.id,
    fromDate: '2024-01-01',
    toDate: null,
    tjmCents: 75000,
  }, // 750 €/j
  {
    id: ids.next(),
    gradeId: gradeSenior.id,
    fromDate: '2024-01-01',
    toDate: null,
    tjmCents: 95000,
  }, // 950 €/j
  {
    id: ids.next(),
    gradeId: gradeManager.id,
    fromDate: '2024-01-01',
    toDate: null,
    tjmCents: 120000,
  }, // 1200 €/j
] as const;

// ── Consultant habilitations ────────────────────────────────────────────────

export const consultantHabilitations = [
  {
    id: ids.next(),
    consultantId: alice.id,
    habilitationId: passi.id,
    obtainedAt: '2025-03-15',
    expiresAt: null,
  },
] as const;

// ── Clients ─────────────────────────────────────────────────────────────────
// Four clients exercising the four territoriality cases:
// 1. Metropolitan France (standard 20%)
// 2. Overseas with VAT — Réunion (8.5%)
// 3. Overseas outside VAT scope — Guyane
// 4. European Union — Belgium (autoliquidation)

export const clients = [
  {
    id: ids.next(),
    name: 'Banque Nationale de Test',
    siren: '443061841',
    intraCommunityVatNumber: 'FR15443061841',
    territoriality: 'metropolitanFrance' as const,
    billingAddress: {
      street: '10 avenue des Champs-Élysées',
      postalCode: '75008',
      city: 'Paris',
      country: 'France',
    },
    deliveryAddress: null,
  },
  {
    id: ids.next(),
    name: 'Réunion Cyber Services',
    siren: '517403572',
    intraCommunityVatNumber: null,
    territoriality: 'overseasWithVat' as const,
    billingAddress: {
      street: '5 rue du Port',
      postalCode: '97400',
      city: 'Saint-Denis',
      country: 'France',
    },
    deliveryAddress: null,
  },
  {
    id: ids.next(),
    name: 'Guyane Sécurité Informatique',
    siren: '823476148',
    intraCommunityVatNumber: null,
    territoriality: 'overseasOutsideVatScope' as const,
    billingAddress: {
      street: '3 boulevard Jubelin',
      postalCode: '97300',
      city: 'Cayenne',
      country: 'France',
    },
    deliveryAddress: null,
  },
  {
    id: ids.next(),
    name: 'EuroSecure SPRL',
    siren: null,
    intraCommunityVatNumber: 'BE0836927436',
    territoriality: 'europeanUnion' as const,
    billingAddress: {
      street: '15 rue de la Loi',
      postalCode: '1000',
      city: 'Bruxelles',
      country: 'Belgique',
    },
    deliveryAddress: null,
  },
] as const;

// Internal "client" representing the firm itself — the Intercontrat mission needs a client_id
// because the FK is NOT NULL. The billing model is Forfait so it produces no invoice (ADR-0037).
export const internalClient = {
  id: ids.next(),
  name: 'SecureCo (interne)',
  siren: legalEntityData.siren,
  intraCommunityVatNumber: legalEntityData.intraCommunityVatNumber,
  territoriality: 'metropolitanFrance' as const,
  billingAddress: {
    street: legalEntityData.address.line1,
    postalCode: legalEntityData.address.postalCode,
    city: legalEntityData.address.city,
    country: legalEntityData.address.country,
  },
  deliveryAddress: null,
} as const;

const [clientMetro, clientReunion, clientGuyane, clientEu] = clients;

// ── Missions ────────────────────────────────────────────────────────────────

export const missions = [
  // Regie missions — these produce invoices
  //
  // `startDate` on these three (Audit DORA, SOC Réunion, GRC Guyane) was `2026-01-05`/`2026-03-
  // 01`/`2026-02-01` until item 6 (QA round 1): pushed back to 2016 so the roster's veteran
  // consultants (`julien`, `camille`, `theo` below) can carry a sparse **historical** Cra on the
  // same mission id — one mission's whole lifetime rather than a second, parallel "legacy"
  // mission per veteran. `missionTjm` below grows a matching historical rate window per mission;
  // the *existing* 2026 entry is untouched, so Alice/Claire/David's own 2026 invoices resolve
  // exactly the Tjm they always did.
  {
    id: ids.next(),
    clientId: clientMetro.id,
    name: 'Audit DORA — Banque Nationale',
    billingModel: 'Regie' as const,
    startDate: '2016-01-01',
    endDate: null,
  },
  {
    id: ids.next(),
    clientId: clientReunion.id,
    name: 'SOC Réunion Cyber',
    billingModel: 'Regie' as const,
    startDate: '2016-01-01',
    endDate: null,
  },
  {
    id: ids.next(),
    clientId: clientGuyane.id,
    name: 'GRC Guyane Sécurité',
    billingModel: 'Regie' as const,
    startDate: '2016-01-01',
    endDate: null,
  },
  {
    id: ids.next(),
    clientId: clientEu.id,
    name: 'IAM EuroSecure',
    billingModel: 'Regie' as const,
    startDate: '2026-04-01',
    endDate: null,
  },
  // PASSI-qualified audit mission — requires the PASSI habilitation
  {
    id: ids.next(),
    clientId: clientMetro.id,
    name: 'Audit PASSI — Banque Nationale',
    billingModel: 'Regie' as const,
    startDate: '2026-05-01',
    endDate: null,
  },
  // Forfait mission — present in the dataset, never invoiced (ADR-0037). `endDate` was
  // `2026-06-30` until item 6 (QA round 1): pushed to `null` (ongoing) so Gabrielle — Forfait,
  // "present but not invoiced" is her whole point in this dataset — stays actively assigned
  // through July and August rather than falling out of every consultant's dense months.
  {
    id: ids.next(),
    clientId: clientMetro.id,
    name: 'Pentest Forfait — Banque Nationale',
    billingModel: 'Forfait' as const,
    startDate: '2026-01-15',
    endDate: null,
  },
  // Internal mission for Intercontrat (settled 18/08 — Forfait, not billable)
  {
    id: ids.next(),
    clientId: internalClient.id,
    name: 'Intercontrat',
    billingModel: 'Forfait' as const,
    startDate: '2026-01-01',
    endDate: null,
  },
] as const;

const [
  mAuditDora,
  mSocReunion,
  mGrcGuyane,
  mIamEurosecure,
  mAuditPassi,
  mPentestForfait,
  mIntercontrat,
] = missions;

// ── Mission habilitations (PASSI required on the PASSI audit mission) ───────

export const missionHabilitations = [
  { id: ids.next(), missionId: mAuditPassi.id, habilitationId: passi.id },
] as const;

// ── Mission TJM (the contractual daily rate, in integer cents) ───────────────
// All rates are multiples of 100 (whole euros). Synthetic values only.

export const missionTjm = [
  {
    id: ids.next(),
    missionId: mAuditDora.id,
    fromDate: '2026-01-05',
    toDate: null,
    tjmCents: 80000,
  }, // 800 €/j
  {
    id: ids.next(),
    missionId: mSocReunion.id,
    fromDate: '2026-03-01',
    toDate: null,
    tjmCents: 70000,
  }, // 700 €/j
  {
    id: ids.next(),
    missionId: mGrcGuyane.id,
    fromDate: '2026-02-01',
    toDate: null,
    tjmCents: 75000,
  }, // 750 €/j
  {
    id: ids.next(),
    missionId: mIamEurosecure.id,
    fromDate: '2026-04-01',
    toDate: null,
    tjmCents: 85000,
  }, // 850 €/j
  {
    id: ids.next(),
    missionId: mAuditPassi.id,
    fromDate: '2026-05-01',
    toDate: null,
    tjmCents: 95000,
  }, // 950 €/j
  // Roster expansion (item 6, QA round 1): a historical rate window on each of the three
  // missions pushed back to 2016 above, ending the day before that mission's existing 2026 entry
  // starts — non-overlapping, so Alice/Claire/David's own 2026 invoices resolve exactly the Tjm
  // they always did. One flat rate for the whole 2016–2025 span: `Tjm` is dated (BUILD-RULES), and
  // one window already exercises that a historical invoice resolves *its own period's* rate
  // rather than today's — a second rate change inside the span would prove the same thing twice.
  {
    id: ids.next(),
    missionId: mAuditDora.id,
    fromDate: '2016-01-01',
    toDate: '2026-01-04',
    tjmCents: 72000,
  }, // 720 €/j
  {
    id: ids.next(),
    missionId: mSocReunion.id,
    fromDate: '2016-01-01',
    toDate: '2026-02-28',
    tjmCents: 63000,
  }, // 630 €/j
  {
    id: ids.next(),
    missionId: mGrcGuyane.id,
    fromDate: '2016-01-01',
    toDate: '2026-01-31',
    tjmCents: 68000,
  }, // 680 €/j
] as const;

// ── Assignments ─────────────────────────────────────────────────────────────

export const assignments = [
  // Alice → Audit DORA (main mission) + Audit PASSI (requires PASSI habilitation)
  {
    id: ids.next(),
    consultantId: alice.id,
    missionId: mAuditDora.id,
    fromDate: '2026-01-05',
    toDate: null,
  },
  {
    id: ids.next(),
    consultantId: alice.id,
    missionId: mAuditPassi.id,
    fromDate: '2026-05-01',
    toDate: null,
  },
  // Claire → SOC Réunion
  {
    id: ids.next(),
    consultantId: claire.id,
    missionId: mSocReunion.id,
    fromDate: '2026-03-01',
    toDate: null,
  },
  // David → GRC Guyane
  {
    id: ids.next(),
    consultantId: david.id,
    missionId: mGrcGuyane.id,
    fromDate: '2026-02-01',
    toDate: null,
  },
  // François → IAM EuroSecure
  {
    id: ids.next(),
    consultantId: francois.id,
    missionId: mIamEurosecure.id,
    fromDate: '2026-04-01',
    toDate: null,
  },
  // Gabrielle → Pentest Forfait (Forfait — present, not invoiced). `toDate` was `2026-06-30`
  // until item 6 (QA round 1) — now open-ended, matching the mission's own new `endDate: null`.
  {
    id: ids.next(),
    consultantId: gabrielle.id,
    missionId: mPentestForfait.id,
    fromDate: '2026-01-15',
    toDate: null,
  },
  // Inès → Intercontrat (internal Forfait mission)
  {
    id: ids.next(),
    consultantId: ines.id,
    missionId: mIntercontrat.id,
    fromDate: '2026-01-01',
    toDate: null,
  },
  // Roster expansion (item 6, QA round 1): one continuous assignment per new consultant, from
  // their own join date (2016 for the veterans/departure, 2025 for dense-only fillers) through
  // `null` — or the departure date for Marine, closed the same way ADR-0079 asks every open row
  // to close. Julien/Camille/Théo sit on the same historically-extended mission a veteran of
  // their office would realistically have carried for a decade (`mAuditDora`/`mSocReunion`/
  // `mGrcGuyane`, all pushed back to 2016 above); Karim and Thomas, the two new managers, carry
  // none.
  {
    id: ids.next(),
    consultantId: julien.id,
    missionId: mAuditDora.id,
    fromDate: '2016-01-01',
    toDate: null,
  },
  {
    id: ids.next(),
    consultantId: marine.id,
    missionId: mAuditDora.id,
    fromDate: '2016-01-01',
    toDate: '2022-12-31',
  },
  {
    id: ids.next(),
    consultantId: camille.id,
    missionId: mSocReunion.id,
    fromDate: '2016-01-01',
    toDate: null,
  },
  {
    id: ids.next(),
    consultantId: theo.id,
    missionId: mGrcGuyane.id,
    fromDate: '2016-01-01',
    toDate: null,
  },
  ...parisFillers.map((c, index) => ({
    id: ids.next(),
    consultantId: c.id,
    missionId: index < PARIS_REGIE_FILLER_COUNT ? mAuditDora.id : mIntercontrat.id,
    fromDate: '2025-01-01',
    toDate: null,
  })),
  ...lyonFillers.map((c, index) => ({
    id: ids.next(),
    consultantId: c.id,
    missionId:
      index < LYON_REGIE_FILLER_COUNT
        ? index % 2 === 0
          ? mGrcGuyane.id
          : mIamEurosecure.id
        : mIntercontrat.id,
    fromDate: '2025-01-01',
    toDate: null,
  })),
  ...bordeauxFillers.map((c, index) => ({
    id: ids.next(),
    consultantId: c.id,
    missionId: index < BORDEAUX_REGIE_FILLER_COUNT ? mSocReunion.id : mIntercontrat.id,
    fromDate: '2025-01-01',
    toDate: null,
  })),
] as const;

// ── Manager attachments ─────────────────────────────────────────────────────
// Each consultant reports to a manager in that consultant's own office; managers report to the
// director, the one attachment that crosses an office. ADR-0094 — and
// `tests/seed-office-scope.test.ts`, which fails if either half stops holding.

export const managerAttachments = [
  {
    id: ids.next(),
    consultantId: alice.id,
    managerId: bruno.id,
    fromDate: '2024-01-01',
    toDate: null,
  },
  {
    id: ids.next(),
    consultantId: claire.id,
    managerId: bruno.id,
    fromDate: '2025-01-01',
    toDate: null,
  },
  {
    id: ids.next(),
    consultantId: david.id,
    managerId: emma.id,
    fromDate: '2024-01-01',
    toDate: null,
  },
  // Rennes and Bordeaux, not Lyon/Paris: François and Gabrielle report to their own office's
  // manager, Thomas and Karim. ADR-0094.
  {
    id: ids.next(),
    consultantId: francois.id,
    managerId: thomas.id,
    fromDate: '2023-06-01',
    toDate: null,
  },
  {
    id: ids.next(),
    consultantId: gabrielle.id,
    managerId: karim.id,
    fromDate: '2024-06-01',
    toDate: null,
  },
  {
    id: ids.next(),
    consultantId: ines.id,
    managerId: emma.id,
    fromDate: '2026-01-01',
    toDate: null,
  },
  // Managers report to the director
  {
    id: ids.next(),
    consultantId: bruno.id,
    managerId: henri.id,
    fromDate: '2023-01-01',
    toDate: null,
  },
  {
    id: ids.next(),
    consultantId: emma.id,
    managerId: henri.id,
    fromDate: '2023-06-01',
    toDate: null,
  },
  // Roster expansion (item 6, QA round 1): Karim is Bordeaux's own new manager, reporting to
  // Henri like Bruno/Emma — dated from 2016 (not 2024) so he can already be Théo's manager on
  // Théo's earliest historical Cra below.
  {
    id: ids.next(),
    consultantId: karim.id,
    managerId: henri.id,
    fromDate: '2016-01-01',
    toDate: null,
  },
  // Thomas is Rennes' own manager, modelled on Karim in every respect (ADR-0094) — dated from
  // 2016 so he can already be François's manager on François's own row above.
  {
    id: ids.next(),
    consultantId: thomas.id,
    managerId: henri.id,
    fromDate: '2016-01-01',
    toDate: null,
  },
  // The four named veterans/departure, one row each, spanning their whole tenure — closed at
  // Marine's departure, open-ended for the three still on staff.
  {
    id: ids.next(),
    consultantId: julien.id,
    managerId: bruno.id,
    fromDate: '2016-01-01',
    toDate: null,
  },
  {
    id: ids.next(),
    consultantId: marine.id,
    managerId: bruno.id,
    fromDate: '2016-01-01',
    toDate: '2022-12-31',
  },
  {
    id: ids.next(),
    consultantId: camille.id,
    managerId: emma.id,
    fromDate: '2016-01-01',
    toDate: null,
  },
  {
    id: ids.next(),
    consultantId: theo.id,
    managerId: karim.id,
    fromDate: '2016-01-01',
    toDate: null,
  },
  // Every dense-only filler, one row each, reporting to their office's manager since 2025.
  ...parisFillers.map((c) => ({
    id: ids.next(),
    consultantId: c.id,
    managerId: bruno.id,
    fromDate: '2025-01-01',
    toDate: null,
  })),
  ...lyonFillers.map((c) => ({
    id: ids.next(),
    consultantId: c.id,
    managerId: emma.id,
    fromDate: '2025-01-01',
    toDate: null,
  })),
  ...bordeauxFillers.map((c) => ({
    id: ids.next(),
    consultantId: c.id,
    managerId: karim.id,
    fromDate: '2025-01-01',
    toDate: null,
  })),
] as const;

/**
 * The one consultant whose June is **submitted and not validated**.
 *
 * Without it the seeded instance has nothing to validate, so the chain this whole repository is
 * about — a manager accepts a month and the draft invoices appear — could be described but not
 * performed. Claire is in Paris, so `manager-paris` is in scope to validate her; her mission bills
 * the Réunion client at 8,5 %, so the invoice that appears is also the one that exercises the DOM
 * VAT rate.
 */
export const SUBMITTED_NOT_VALIDATED_EMAIL = 'claire.dubois@secureco.test';

/**
 * Who the seed's historical invoices are issued as (item 6, QA round 1). Henri, and only Henri:
 * he is the one consultant guaranteed absent from every `validated_by` in this dataset (the same
 * property `personas` already relies on for `billing-paris`), so issuing as anyone else risks
 * `ValidatorCannotIssueError` the moment a historical veteran's manager and issuer collide.
 */
export const ISSUER_EMAIL = henri.email;

/**
 * The month that is **not** uniform.
 *
 * Every other seeded June is every workable day, four quarter-days, one mission — which is a
 * legible default and exercises none of the five things the model spends structure on.
 * `CONTEXT.md` § Records of time gives the split day as the *structural reason* the mission sits
 * on the line rather than on the day, and until this existed no dataset contained one;
 * `timesheet.cra_flags` was created, indexed and read by nothing because no seeded day was ever
 * flaggable; no `absence` existed, so a non-billable recorded day was a code path with no
 * example; and a 2/2 split proves nothing about the quarter-day unit ADR-0069 introduced — it
 * round-trips unchanged through the half-day model it replaced, which is why `quarterProofDay`
 * exists as a second, distinct day rather than being folded into `splitDay`.
 *
 * `splitDay` stays an even 2/2 split on purpose: it is the physical shape ADR-0012 always gave a
 * day worked on two missions (half a day each), now spelled in quarters, and it is the one shape
 * every screen still active during this phase — including the legacy two-slot grid,
 * `apps/web/src/features/cra/slots.ts` — can still render exactly as it always has.
 * `quarterProofDay`'s 3/1 split is what a whole number of half-days cannot express, and what
 * makes at least one seeded invoice line carry a quantity that is not a multiple of four; the
 * legacy two-slot grid cannot display it exactly (documented at `slotsFor`), which is expected
 * and untested, because nothing reads that day's cell content — only the totals and the invoice
 * line the chain produces from it.
 *
 * Alice carries all five because she is the one consultant staffed on two missions, and both are
 * sold to the same client — so each split day produces a second **line** on one invoice rather
 * than a second invoice, which is the shape ADR-0038 says to expect and is what a reader should
 * see first.
 *
 * There is no flagged **public holiday**, and that is the calendar rather than an omission: June
 * 2026 has none (ADR-0004's table puts Ascension on 14/05 and Pentecost on 25/05). The weekend
 * half of the rule is what June can demonstrate.
 */
export const VARIED_MONTH = {
  email: 'alice.martin@secureco.test',
  /** Two quarter-days on each mission — half a day each, the shape every screen can still render. */
  splitDay: '2026-06-11',
  /** A full day off. Recorded, so the month still adds up; not billable, so no line comes of it. */
  absenceDay: '2026-06-18',
  /** A Saturday worked. Not a refusal — it is the manager's to accept — so it is flagged. */
  flaggedSaturday: '2026-06-13',
  /**
   * Three quarter-days on the primary mission, one on the second. Friday, an ordinary workable
   * day, distinct from `splitDay`. Not an even 2/2 split on purpose (ADR-0069): a 2/2 split
   * collapses to the same two half-days the old model already recorded and proves nothing about
   * the unit that replaced it.
   */
  quarterProofDay: '2026-06-12',
} as const;

// ── Personas ────────────────────────────────────────────────────────────────
// The four selectable identities of ADR-0023. Four entries over three roles, and the fourth is
// the point: `manager-lyon` is what makes an out-of-scope refusal reproducible by switching
// persona rather than by hand-crafting a URL.
//
// `billing-paris` is Henri and not a manager, because `Invoice.issue()` refuses whoever validated
// the days it bills (ADR-0006 rule 2). Henri validates nobody's CRA in this dataset — Bruno and
// Emma do — and appears on no invoice's `validated_by`, which is what lets the demonstration's
// happy path reach an issued document.

export const personas = [
  {
    id: ids.next(),
    key: 'consultant-paris',
    role: 'consultant',
    consultantId: alice.id,
    displayOrder: 1,
  },
  {
    id: ids.next(),
    key: 'manager-paris',
    role: 'manager',
    consultantId: bruno.id,
    displayOrder: 2,
  },
  { id: ids.next(), key: 'manager-lyon', role: 'manager', consultantId: emma.id, displayOrder: 3 },
  {
    id: ids.next(),
    key: 'billing-paris',
    role: 'billing',
    consultantId: henri.id,
    displayOrder: 4,
  },
] as const;

// ── CRA period ──────────────────────────────────────────────────────────────
// June 2026: the original month, where `VARIED_MONTH` and `SUBMITTED_NOT_VALIDATED_EMAIL` live.

export const CRA_PERIOD = '2026-06';

/**
 * Item 6 (QA round 1): dense CRAs for every active consultant across three consecutive months,
 * not just the original June — the mockup is reviewed in September 2026, so June/July/August
 * should all read as already closed out. Every active consultant, Alice included (item 2, QA
 * round 2 — her own August used to be withheld here for `journeys.spec.ts`'s interactive
 * create/submit/validate journey; that journey now runs against September instead, which stays
 * genuinely blank for everyone simply by not being in this list, so no per-consultant withhold
 * list is needed any more).
 */
export const DENSE_PERIODS = ['2026-06', '2026-07', '2026-08'] as const;

/** One historical Cra-period list per veteran/departed consultant (item 6's own "sparse back to
 * 2016" and "at least one departure"), keyed by email like the exclusions above. Every 24 months
 * from 2016 — sparse, not monthly, per the plan's own contingency ("cut the span, do not
 * optimise" if the seed's 60s budget does not hold); Marine's list stops at 2022, the last one
 * before her `2022-12-31` departure. */
export interface HistoricalVeteran {
  readonly email: string;
  readonly periods: readonly string[];
}

const VETERAN_PERIODS = ['2016-06', '2018-06', '2020-06', '2022-06', '2024-06'] as const;

export const HISTORICAL_VETERANS: readonly HistoricalVeteran[] = [
  { email: julien.email, periods: VETERAN_PERIODS },
  // marine.departureDate is '2022-12-31' — filtered rather than repeated, so the two can never
  // drift apart.
  {
    email: marine.email,
    periods: VETERAN_PERIODS.filter((p) => p <= (marine.departureDate ?? '')),
  },
  { email: camille.email, periods: VETERAN_PERIODS },
  { email: theo.email, periods: VETERAN_PERIODS },
];

/** The clock a historical period's submit/validate is stamped with: the 5th of the month after
 * the period closes at 10:00 UTC (June 2026 closes 30/06, its clock reads 05/07) — a function
 * rather than one frozen constant so every period gets its own plausible timestamp instead of all
 * sharing one. It replaced that constant when the historical periods arrived (item 6, QA round 1). */
export function clockInstantAfter(period: string): Date {
  const [year, month] = period.split('-').map(Number) as [number, number];
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return new Date(Date.UTC(nextYear, nextMonth - 1, 5, 10, 0, 0));
}

export { ids, SEED_TIMESTAMP_MS };
