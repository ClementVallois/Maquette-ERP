/**
 * The deterministic dataset (ADR-0022). Every identifier, every name, every rate is literal: the
 * same script produces the same database on every machine, every time. No real name, no real rate.
 *
 * Shape fixed by CLAUDE.md: 5 practices · 4 offices · Regie AND Forfait missions (only Regie
 * invoiced) · one Intercontrat consultant · one PASSI Habilitation constraining an assignment ·
 * Réunion client at 8.5 % · EU B2B client under Autoliquidation · Guyane client outside VAT scope ·
 * Grade carrying the default Tjm grid · Cjm as the sensitive value the scope test protects.
 */

import { deterministicIdFactory } from './uuidv7.ts';

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

export const consultants = [
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

const [alice, bruno, claire, david, emma, francois, gabrielle, henri, ines] = consultants;

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
  {
    id: ids.next(),
    clientId: clientMetro.id,
    name: 'Audit DORA — Banque Nationale',
    billingModel: 'Regie' as const,
    startDate: '2026-01-05',
    endDate: null,
  },
  {
    id: ids.next(),
    clientId: clientReunion.id,
    name: 'SOC Réunion Cyber',
    billingModel: 'Regie' as const,
    startDate: '2026-03-01',
    endDate: null,
  },
  {
    id: ids.next(),
    clientId: clientGuyane.id,
    name: 'GRC Guyane Sécurité',
    billingModel: 'Regie' as const,
    startDate: '2026-02-01',
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
  // Forfait mission — present in the dataset, never invoiced (ADR-0037)
  {
    id: ids.next(),
    clientId: clientMetro.id,
    name: 'Pentest Forfait — Banque Nationale',
    billingModel: 'Forfait' as const,
    startDate: '2026-01-15',
    endDate: '2026-06-30',
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
  // Gabrielle → Pentest Forfait (Forfait — present, not invoiced)
  {
    id: ids.next(),
    consultantId: gabrielle.id,
    missionId: mPentestForfait.id,
    fromDate: '2026-01-15',
    toDate: '2026-06-30',
  },
  // Inès → Intercontrat (internal Forfait mission)
  {
    id: ids.next(),
    consultantId: ines.id,
    missionId: mIntercontrat.id,
    fromDate: '2026-01-01',
    toDate: null,
  },
] as const;

// ── Manager attachments ─────────────────────────────────────────────────────
// Each consultant reports to a manager. Managers report to the director.

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
  {
    id: ids.next(),
    consultantId: francois.id,
    managerId: emma.id,
    fromDate: '2023-06-01',
    toDate: null,
  },
  {
    id: ids.next(),
    consultantId: gabrielle.id,
    managerId: bruno.id,
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
] as const;

// ── CRA period ──────────────────────────────────────────────────────────────
// June 2026: a month where the working calendar is valid and the Intercontrat scenario works.

export const CRA_PERIOD = '2026-06';

// A fixed clock instant for submit/validate timestamps: deterministic across runs.
export const SEED_CLOCK_INSTANT = new Date('2026-07-05T10:00:00.000Z');

export { ids, SEED_TIMESTAMP_MS };
