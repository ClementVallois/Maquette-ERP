/**
 * Deterministic seed (ADR-0022). Drives the domain aggregates to prove the dataset is reachable
 * through the invariants: every CRA passes every submission check, every invoice is drafted through
 * `draftInvoicesFrom`. A tightened invariant fails here before it fails a user.
 *
 * Runs as the MIGRATION role (schema owner) — the seed writes to every table the migrations
 * create, and it needs TRUNCATE to clear existing data (which erp_app does not have).
 */

import pg from 'pg';
import { z } from 'zod/v4';

import { PgEventStore, uuidv7Deterministic } from '@erp/api';
import {
  billingReference,
  client as clientFactory,
  commercialMission,
  type CreditNoteReason,
  creditNote,
  draftInvoicesFrom,
  type DraftInvoicesDependencies,
  legalEntity as legalEntityFactory,
  legalMentions,
  paymentTerms,
  PgInvoiceRepository,
  PgNumberingCounter,
  RECOVERY_INDEMNITY_CENTS,
} from '@erp/billing';
import {
  type Clock,
  isoDateInFirmTimeZone,
  lastDayOf,
  periodFromIso,
  ROLES,
  TechnicalFailure,
  TIMESHEET_VALIDATED,
  TIMESHEET_VALIDATED_VERSION,
  type TimesheetValidated,
  type TimesheetValidatedPayload,
} from '@erp/platform';
import {
  type Assignment as TimesheetAssignment,
  Cra,
  hierarchy,
  type ManagerAttachment,
  type Mission as TimesheetMission,
  PgCraRepository,
  timesheetReference,
  type TimesheetReference,
  workingCalendar,
} from '@erp/timesheet';

import {
  assignments,
  clients,
  clockInstantAfter,
  consultantGrades,
  consultantHabilitations,
  consultants,
  CRA_PERIOD,
  DENSE_PERIODS,
  gradeTjmDefaults,
  grades,
  habilitations,
  HISTORICAL_VETERANS,
  internalClient,
  ISSUER_EMAIL,
  legalEntityData,
  managerAttachments,
  missionHabilitations,
  missions,
  missionTjm,
  offices,
  personas,
  practices,
  SEED_TIMESTAMP_MS,
  SUBMITTED_NOT_VALIDATED_EMAIL,
  VARIED_MONTH,
} from './lib/seed-data.ts';

const { Client: PgClient } = pg;

class SeedDataError extends TechnicalFailure {
  readonly retryable = false;
}

// ── Zod validation at the boundary ──────────────────────────────────────────

const OfficeSchema = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
});

const PracticeSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const GradeSchema = z.object({
  id: z.string(),
  name: z.string(),
  rank: z.number().int().positive(),
});

const HabilitationSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const IsoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const ConsultantSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  officeId: z.string(),
  practiceId: z.string(),
  role: z.enum(['consultant', 'manager', 'director']),
  // ADR-0079: nullable, defaulting to null (still with the firm) so the original nine — and every
  // roster-expansion consultant who never left — need no explicit field.
  departureDate: IsoDateString.nullable().optional(),
});

const ClientSchema = z.object({
  id: z.string(),
  name: z.string(),
  siren: z.string().nullable(),
  intraCommunityVatNumber: z.string().nullable(),
  territoriality: z.enum([
    'metropolitanFrance',
    'overseasWithVat',
    'overseasOutsideVatScope',
    'europeanUnion',
  ]),
  billingAddress: z.object({
    street: z.string(),
    postalCode: z.string(),
    city: z.string(),
    country: z.string(),
  }),
  deliveryAddress: z
    .object({
      street: z.string(),
      postalCode: z.string(),
      city: z.string(),
      country: z.string(),
    })
    .nullable(),
});

const MissionSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  name: z.string(),
  billingModel: z.enum(['Regie', 'Forfait']),
  startDate: z.string(),
  endDate: z.string().nullable(),
});

const MissionTjmSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  fromDate: z.string(),
  toDate: z.string().nullable(),
  tjmCents: z.number().int().positive(),
});

const AssignmentSchema = z.object({
  id: z.string(),
  consultantId: z.string(),
  missionId: z.string(),
  fromDate: z.string(),
  toDate: z.string().nullable(),
});

const ManagerAttachmentSchema = z.object({
  id: z.string(),
  consultantId: z.string(),
  managerId: z.string(),
  fromDate: z.string(),
  toDate: z.string().nullable(),
});

/**
 * The money columns of migration 007. `.int()` is the half that matters: a `cjmCents` of 250.5
 * otherwise skips the boundary entirely and surfaces as a raw Postgres `check constraint
 * violated`, which names neither the field nor the file it came from.
 *
 * The multiple-of-100 rule is the schema's too, and not the database's alone: `docs/BUILD-RULES.md`
 * § Money states it about every daily rate, and migration 007 doubles it — which is the order this
 * repository wants, an invariant refused at the boundary and the constraint behind it as the net.
 */
const WholeEuroCents = z
  .number()
  .int()
  .positive()
  .refine((cents) => cents % 100 === 0, 'a daily rate is a whole number of euros');

const AddressSchema = z.object({
  line1: z.string(),
  line2: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
});

const LegalEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  legalForm: z.string(),
  shareCapitalCents: z.number().int().positive(),
  siren: z.string().regex(/^\d{9}$/),
  intraCommunityVatNumber: z.string(),
  rcsRegistration: z.string(),
  address: AddressSchema,
  numberPrefix: z.string().min(1),
});

const ConsultantGradeSchema = z.object({
  id: z.string(),
  consultantId: z.string(),
  gradeId: z.string(),
  fromDate: IsoDateString,
  toDate: IsoDateString.nullable(),
  cjmCents: WholeEuroCents,
});

const GradeTjmDefaultSchema = z.object({
  id: z.string(),
  gradeId: z.string(),
  fromDate: IsoDateString,
  toDate: IsoDateString.nullable(),
  tjmCents: WholeEuroCents,
});

const ConsultantHabilitationSchema = z.object({
  id: z.string(),
  consultantId: z.string(),
  habilitationId: z.string(),
  obtainedAt: IsoDateString,
  expiresAt: IsoDateString.nullable(),
});

const MissionHabilitationSchema = z.object({
  id: z.string(),
  missionId: z.string(),
  habilitationId: z.string(),
});

const PersonaSchema = z.object({
  id: z.string(),
  key: z.string().regex(/^[a-z][a-z0-9-]*$/),
  role: z.enum(ROLES),
  consultantId: z.string(),
  displayOrder: z.number().int().positive(),
});

function validate<T>(schema: z.ZodType<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`Seed data validation failed for ${label}:`, z.prettifyError(result.error));
    process.exit(1);
  }
  return result.data;
}

function validateArray<T>(schema: z.ZodType<T>, data: readonly unknown[], label: string): T[] {
  return data.map((item, index) => validate(schema, item, `${label}[${String(index)}]`));
}

// ── Seed logic ──────────────────────────────────────────────────────────────

async function seed(): Promise<void> {
  const url = process.env['MIGRATION_DATABASE_URL'];
  if (!url) {
    console.error('MIGRATION_DATABASE_URL is not set — run `pnpm run env:init`');
    process.exit(1);
  }

  // Validate all seed data at the boundary before touching the database
  const validatedOffices = validateArray(OfficeSchema, offices, 'offices');
  const validatedPractices = validateArray(PracticeSchema, practices, 'practices');
  const validatedGrades = validateArray(GradeSchema, grades, 'grades');
  const validatedHabilitations = validateArray(HabilitationSchema, habilitations, 'habilitations');
  const validatedConsultants = validateArray(ConsultantSchema, consultants, 'consultants');
  const allClients = [...clients, internalClient];
  const validatedClients = validateArray(ClientSchema, allClients, 'clients');
  const validatedMissions = validateArray(MissionSchema, missions, 'missions');
  const validatedMissionTjm = validateArray(MissionTjmSchema, missionTjm, 'missionTjm');
  const validatedAssignments = validateArray(AssignmentSchema, assignments, 'assignments');
  const validatedManagerAttachments = validateArray(
    ManagerAttachmentSchema,
    managerAttachments,
    'managerAttachments',
  );
  const validatedPersonas = validateArray(PersonaSchema, personas, 'personas');
  const validatedLegalEntity = validate(LegalEntitySchema, legalEntityData, 'legalEntity');
  const validatedConsultantGrades = validateArray(
    ConsultantGradeSchema,
    consultantGrades,
    'consultantGrades',
  );
  const validatedGradeTjmDefaults = validateArray(
    GradeTjmDefaultSchema,
    gradeTjmDefaults,
    'gradeTjmDefaults',
  );
  const validatedConsultantHabilitations = validateArray(
    ConsultantHabilitationSchema,
    consultantHabilitations,
    'consultantHabilitations',
  );
  const validatedMissionHabilitations = validateArray(
    MissionHabilitationSchema,
    missionHabilitations,
    'missionHabilitations',
  );

  const client = new PgClient({ connectionString: url });
  await client.connect();

  try {
    await client.query('BEGIN');

    // Clear existing data in reverse dependency order
    await client.query('DELETE FROM billing.invoice_vat_groups');
    await client.query('DELETE FROM billing.invoice_lines');
    await client.query('DELETE FROM billing.invoices');
    await client.query('DELETE FROM billing.numbering_series');
    await client.query('DELETE FROM billing.declined_days');
    await client.query('DELETE FROM public.domain_events');
    await client.query('DELETE FROM timesheet.cra_flags');
    await client.query('DELETE FROM timesheet.cra_lines');
    await client.query('DELETE FROM timesheet.cras');
    await client.query('DELETE FROM public.mission_habilitations');
    await client.query('DELETE FROM public.consultant_habilitations');
    await client.query('DELETE FROM public.grade_tjm_defaults');
    await client.query('DELETE FROM public.consultant_grades');
    await client.query('DELETE FROM public.assignments');
    await client.query('DELETE FROM public.mission_tjm');
    await client.query('DELETE FROM public.missions');
    await client.query('DELETE FROM public.personas');
    await client.query('DELETE FROM public.manager_attachments');
    await client.query('DELETE FROM public.clients');
    await client.query('DELETE FROM public.consultants');
    await client.query('DELETE FROM public.habilitations');
    await client.query('DELETE FROM public.grades');
    await client.query('DELETE FROM public.practices');
    await client.query('DELETE FROM public.offices');
    await client.query('DELETE FROM public.legal_entities');

    // ── Insert reference data ─────────────────────────────────────────────

    for (const o of validatedOffices) {
      await client.query('INSERT INTO public.offices (id, name, city) VALUES ($1, $2, $3)', [
        o.id,
        o.name,
        o.city,
      ]);
    }
    console.log(`Seeded ${String(validatedOffices.length)} offices.`);

    for (const p of validatedPractices) {
      await client.query('INSERT INTO public.practices (id, name) VALUES ($1, $2)', [p.id, p.name]);
    }
    console.log(`Seeded ${String(validatedPractices.length)} practices.`);

    for (const g of validatedGrades) {
      await client.query('INSERT INTO public.grades (id, name, rank) VALUES ($1, $2, $3)', [
        g.id,
        g.name,
        g.rank,
      ]);
    }
    console.log(`Seeded ${String(validatedGrades.length)} grades.`);

    for (const h of validatedHabilitations) {
      await client.query('INSERT INTO public.habilitations (id, name) VALUES ($1, $2)', [
        h.id,
        h.name,
      ]);
    }
    console.log(`Seeded ${String(validatedHabilitations.length)} habilitations.`);

    // Legal entity
    const le = validatedLegalEntity;
    await client.query(
      `INSERT INTO public.legal_entities (
        id, name, legal_form, share_capital_cents, siren, intra_community_vat_number,
        rcs_registration, address_street, address_postal_code, address_city, address_country,
        number_prefix
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        le.id,
        le.name,
        le.legalForm,
        le.shareCapitalCents,
        le.siren,
        le.intraCommunityVatNumber,
        le.rcsRegistration,
        le.address.line1,
        le.address.postalCode,
        le.address.city,
        le.address.country,
        le.numberPrefix,
      ],
    );
    console.log('Seeded legal entity.');

    for (const c of validatedConsultants) {
      await client.query(
        `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role, departure_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          c.id,
          c.firstName,
          c.lastName,
          c.email,
          c.officeId,
          c.practiceId,
          c.role,
          c.departureDate ?? null,
        ],
      );
    }
    console.log(`Seeded ${String(validatedConsultants.length)} consultants.`);

    for (const cg of validatedConsultantGrades) {
      await client.query(
        `INSERT INTO public.consultant_grades (id, consultant_id, grade_id, from_date, to_date, cjm_cents)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [cg.id, cg.consultantId, cg.gradeId, cg.fromDate, cg.toDate, cg.cjmCents],
      );
    }
    console.log(`Seeded ${String(validatedConsultantGrades.length)} consultant grades.`);

    for (const gd of validatedGradeTjmDefaults) {
      await client.query(
        `INSERT INTO public.grade_tjm_defaults (id, grade_id, from_date, to_date, tjm_cents)
         VALUES ($1, $2, $3, $4, $5)`,
        [gd.id, gd.gradeId, gd.fromDate, gd.toDate, gd.tjmCents],
      );
    }
    console.log(`Seeded ${String(validatedGradeTjmDefaults.length)} grade TJM defaults.`);

    for (const ch of validatedConsultantHabilitations) {
      await client.query(
        `INSERT INTO public.consultant_habilitations (id, consultant_id, habilitation_id, obtained_at, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [ch.id, ch.consultantId, ch.habilitationId, ch.obtainedAt, ch.expiresAt],
      );
    }
    console.log(
      `Seeded ${String(validatedConsultantHabilitations.length)} consultant habilitations.`,
    );

    for (const cl of validatedClients) {
      await client.query(
        `INSERT INTO public.clients (
          id, name, siren, intra_community_vat_number, territoriality,
          billing_address_street, billing_address_postal_code, billing_address_city, billing_address_country,
          delivery_address_street, delivery_address_postal_code, delivery_address_city, delivery_address_country
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          cl.id,
          cl.name,
          cl.siren,
          cl.intraCommunityVatNumber,
          cl.territoriality,
          cl.billingAddress.street,
          cl.billingAddress.postalCode,
          cl.billingAddress.city,
          cl.billingAddress.country,
          cl.deliveryAddress?.street ?? null,
          cl.deliveryAddress?.postalCode ?? null,
          cl.deliveryAddress?.city ?? null,
          cl.deliveryAddress?.country ?? null,
        ],
      );
    }
    console.log(`Seeded ${String(validatedClients.length)} clients.`);

    for (const m of validatedMissions) {
      await client.query(
        `INSERT INTO public.missions (id, client_id, name, billing_model, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [m.id, m.clientId, m.name, m.billingModel, m.startDate, m.endDate],
      );
    }
    console.log(`Seeded ${String(validatedMissions.length)} missions.`);

    for (const mh of validatedMissionHabilitations) {
      await client.query(
        `INSERT INTO public.mission_habilitations (id, mission_id, habilitation_id) VALUES ($1, $2, $3)`,
        [mh.id, mh.missionId, mh.habilitationId],
      );
    }
    console.log(`Seeded ${String(validatedMissionHabilitations.length)} mission habilitations.`);

    for (const mt of validatedMissionTjm) {
      await client.query(
        `INSERT INTO public.mission_tjm (id, mission_id, from_date, to_date, tjm_cents)
         VALUES ($1, $2, $3, $4, $5)`,
        [mt.id, mt.missionId, mt.fromDate, mt.toDate, mt.tjmCents],
      );
    }
    console.log(`Seeded ${String(validatedMissionTjm.length)} mission TJM entries.`);

    for (const a of validatedAssignments) {
      await client.query(
        `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [a.id, a.consultantId, a.missionId, a.fromDate, a.toDate],
      );
    }
    console.log(`Seeded ${String(validatedAssignments.length)} assignments.`);

    for (const ma of validatedManagerAttachments) {
      await client.query(
        `INSERT INTO public.manager_attachments (id, consultant_id, manager_id, from_date, to_date)
         VALUES ($1, $2, $3, $4, $5)`,
        [ma.id, ma.consultantId, ma.managerId, ma.fromDate, ma.toDate],
      );
    }
    console.log(`Seeded ${String(validatedManagerAttachments.length)} manager attachments.`);

    for (const persona of validatedPersonas) {
      await client.query(
        `INSERT INTO public.personas (id, key, role, consultant_id, display_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [persona.id, persona.key, persona.role, persona.consultantId, persona.displayOrder],
      );
    }
    console.log(`Seeded ${String(validatedPersonas.length)} personas.`);

    // ── Drive domain aggregates ───────────────────────────────────────────
    //
    // CRAs are created through the domain, submitted and validated, so every
    // submission check passes. Then invoices are drafted through the billing
    // domain, proving the dataset is reachable through the invariants.

    const calendar = workingCalendar();

    // Build timesheet reference
    const tsRef: TimesheetReference = timesheetReference({
      missions: validatedMissions.map((m): TimesheetMission => ({
        id: m.id,
        startDate: m.startDate,
        endDate: m.endDate,
        requiredHabilitations: validatedMissionHabilitations
          .filter((mh) => mh.missionId === m.id)
          .map((mh) => mh.habilitationId),
      })),
      assignments: validatedAssignments.map((a): TimesheetAssignment => ({
        consultantId: a.consultantId,
        missionId: a.missionId,
        from: a.fromDate,
        to: a.toDate,
      })),
      held: validatedConsultantHabilitations.map((ch) => ({
        consultantId: ch.consultantId,
        habilitationId: ch.habilitationId,
        from: ch.obtainedAt,
        to: ch.expiresAt,
      })),
    });

    // Build hierarchy
    const mgmtHierarchy = hierarchy(
      validatedManagerAttachments.map((ma): ManagerAttachment => ({
        consultantId: ma.consultantId,
        managerId: ma.managerId,
        from: ma.fromDate,
        to: ma.toDate,
      })),
    );

    // A consultant needs a CRA for a period if they have an active assignment AND an active
    // manager attachment overlapping it — unchanged from the original single-month rule, now
    // parameterised so it can be asked of any of `DENSE_PERIODS` and of every historical period.
    function consultantsWithCrasFor(periodIso: string): typeof validatedConsultants {
      const periodStart = `${periodIso}-01`;
      const periodEnd = lastDayOf(periodFromIso(periodIso));
      return validatedConsultants.filter((c) => {
        const hasAssignment = validatedAssignments.some(
          (a) =>
            a.consultantId === c.id &&
            a.fromDate <= periodEnd &&
            (a.toDate === null || a.toDate >= periodStart),
        );
        const hasManager = validatedManagerAttachments.some(
          (ma) =>
            ma.consultantId === c.id &&
            ma.fromDate <= periodEnd &&
            (ma.toDate === null || ma.toDate >= periodStart),
        );
        return hasAssignment && hasManager;
      });
    }

    // One sequence for every id the write side mints — aggregate ids here, child-row ids inside
    // the repositories, event ids inside the journal. Offset past the reference data's counter so
    // the two never meet. The repositories and the event store take the factory rather than
    // reaching for a generator, which is what makes the seed deterministic and the running system
    // random from the same code (ADR-0041).
    let writeIdCounter = 1000;
    const nextWriteId = (): string => uuidv7Deterministic(SEED_TIMESTAMP_MS, writeIdCounter++);

    const cras = new PgCraRepository(client, nextWriteId);
    const invoices = new PgInvoiceRepository(client, nextWriteId);
    const events = new PgEventStore(client, nextWriteId);

    const seededCras: {
      officeId: string;
      payload: TimesheetValidatedPayload;
      /** Set only for a historical Cra whose invoice gets more than "draft" (item 6, QA round
       * 1) — undefined leaves the invoice as `draftInvoicesFrom` always left it, the seed's
       * original and still-default behaviour for every 2026 dense-month Cra. */
      historicalOutcome?: 'issued' | 'issuedThenCancelled';
    }[] = [];

    /**
     * Opens, fills, submits and — unless withheld — validates one consultant's Cra for one
     * period, through the domain exactly as the original single-month loop did. Shared by the
     * dense-months loop and the historical-widening loop below: the only thing that varies
     * between a 2026 dense month and a 2016 historical one is which period is asked for and
     * whether `VARIED_MONTH`'s split/absence/flagged-Saturday shape applies — and that shape is
     * keyed to Alice's June specifically, so `varied` is false everywhere else by construction.
     */
    async function openSubmitValidate(
      consultant: (typeof validatedConsultants)[number],
      periodIso: string,
    ): Promise<void> {
      const period = periodFromIso(periodIso);
      const workableDays = calendar.workableDaysOf(period);
      const craId = nextWriteId();

      const cra = Cra.open({
        id: craId,
        consultantId: consultant.id,
        officeId: consultant.officeId,
        period,
        // ADR-0079: a Cra opened for a period starting after the consultant's own departure is
        // refused by the domain — every consultant's own `departureDate` reaches this call so
        // that guard is genuinely exercised, not merely available.
        consultantDeparture: consultant.departureDate ?? null,
      });

      const activeAssignments = validatedAssignments.filter(
        (a) =>
          a.consultantId === consultant.id &&
          a.fromDate <= lastDayOf(period) &&
          (a.toDate === null || a.toDate >= `${periodIso}-01`),
      );

      const primaryAssignment = activeAssignments[0];
      const secondAssignment = activeAssignments[1];
      const varied = periodIso === CRA_PERIOD && consultant.email === VARIED_MONTH.email;

      if (primaryAssignment !== undefined) {
        for (const day of workableDays) {
          if (
            day < primaryAssignment.fromDate ||
            (primaryAssignment.toDate !== null && day > primaryAssignment.toDate)
          ) {
            continue;
          }

          if (varied && day === VARIED_MONTH.absenceDay) {
            // No mission: a day not worked is not worked *on* anything (`craLine` refuses the
            // combination), and it produces no invoice line while still making the month add up.
            cra.recordDay({ day, dayType: 'absence', missionId: null, quarterDays: 4 });
            continue;
          }

          if (varied && day === VARIED_MONTH.splitDay && secondAssignment !== undefined) {
            // Two quarters and two: the physical shape ADR-0012's split day always had (half a
            // day on each mission), re-expressed in the new unit. This day stays the one every
            // screen — including the legacy two-slot grid `apps/web/src/features/cra/slots.ts`
            // still renders during the phase this seed serves — can display exactly as before.
            // The quantity that actually exercises quarter-day granularity is
            // `quarterProofDay`, below: a 2/2 split here would prove nothing new (ADR-0069).
            cra.recordDay({
              day,
              dayType: 'worked',
              missionId: primaryAssignment.missionId,
              quarterDays: 2,
            });
            cra.recordDay({
              day,
              dayType: 'worked',
              missionId: secondAssignment.missionId,
              quarterDays: 2,
            });
            continue;
          }

          if (varied && day === VARIED_MONTH.quarterProofDay && secondAssignment !== undefined) {
            // Three quarters and one: a split that cannot be expressed as a whole number of
            // half-days, so the invoice line it produces genuinely needs the quarter-day unit
            // rather than merely being spelled in it (ADR-0069). Pushes both missions' monthly
            // totals off a multiple of four. Not a day the legacy two-slot grid can display
            // exactly — the second slot has nowhere to put a line worth more than half a day
            // once the first one has claimed both — which is expected and documented at
            // `slotsFor` (`apps/web/src/features/cra/slots.ts`): no test reads this day's cell
            // content, only the totals and the invoice line the chain produces from it.
            cra.recordDay({
              day,
              dayType: 'worked',
              missionId: primaryAssignment.missionId,
              quarterDays: 3,
            });
            cra.recordDay({
              day,
              dayType: 'worked',
              missionId: secondAssignment.missionId,
              quarterDays: 1,
            });
            continue;
          }

          cra.recordDay({
            day,
            dayType: 'worked',
            missionId: primaryAssignment.missionId,
            quarterDays: 4,
          });
        }

        // Outside `workableDays` by construction, which is exactly why it ends up in
        // `timesheet.cra_flags`: the calendar says the day is not workable, the record says it was
        // worked, and the submission checks surface the disagreement instead of refusing it.
        if (varied) {
          cra.recordDay({
            day: VARIED_MONTH.flaggedSaturday,
            dayType: 'worked',
            missionId: primaryAssignment.missionId,
            quarterDays: 4,
          });
        }
      }

      cra.submit({
        clock: { now: () => clockInstantAfter(periodIso) },
        calendar,
        reference: tsRef,
      });

      const manager = mgmtHierarchy.managerOf(consultant.id, period);
      if (manager === null) {
        throw new SeedDataError(`No manager found for consultant ${consultant.id} in ${periodIso}`);
      }

      // One Cra stops at `submitted`, on purpose: a dataset where every month is already
      // validated leaves the chain describable and not performable. This is the one the demo
      // validates, and it is why an invoice appears while somebody is watching.
      const withheldFromValidation =
        periodIso === CRA_PERIOD && consultant.email === SUBMITTED_NOT_VALIDATED_EMAIL;
      if (!withheldFromValidation) {
        const validationClock: Clock = { now: () => clockInstantAfter(periodIso) };
        const payload = cra.validate({
          by: manager,
          clock: validationClock,
          hierarchy: mgmtHierarchy,
        });

        seededCras.push({ officeId: consultant.officeId, payload });
      }

      await cras.save(cra);
    }

    // ── Dense 2026 months (item 6, QA round 1) ─────────────────────────────
    //
    // Every active consultant gets June, July and August 2026 (item 2, QA round 2: Alice
    // included — the mockup is reviewed in September, so all three should read as closed out for
    // everyone). September itself is deliberately outside `DENSE_PERIODS`, which is what keeps it
    // blank for `apps/web/e2e/journeys.spec.ts`'s own interactive create/submit/validate journey.
    for (const periodIso of DENSE_PERIODS) {
      let denseCount = 0;
      for (const consultant of consultantsWithCrasFor(periodIso)) {
        await openSubmitValidate(consultant, periodIso);
        denseCount++;
      }
      console.log(`Seeded ${String(denseCount)} Cras for ${periodIso}.`);
    }

    // ── Sparse historical widening, 2016 onward (item 6, QA round 1) ───────
    //
    // A handful of veterans (`HISTORICAL_VETERANS`), one Cra every 24 months rather than every
    // month — sparse, per the plan's own instruction, and cheap enough that the 60s seed budget
    // measured after the dense months above holds with room for it. Processed in date order
    // across every veteran (not veteran by veteran) so the gapless per-fiscal-year invoice
    // numbering below is genuinely exercised rather than trivially satisfied one series at a time.
    const historicalEntries = HISTORICAL_VETERANS.flatMap((veteran, veteranIndex) =>
      veteran.periods.map((periodIso, periodIndex) => ({
        veteran,
        veteranIndex,
        periodIso,
        periodIndex,
      })),
    ).sort((a, b) => (a.periodIso < b.periodIso ? -1 : a.periodIso > b.periodIso ? 1 : 0));

    let historicalCount = 0;
    for (const { veteran, veteranIndex, periodIso, periodIndex } of historicalEntries) {
      const consultant = validatedConsultants.find((c) => c.email === veteran.email);
      if (consultant === undefined) {
        throw new SeedDataError(`Historical veteran ${veteran.email} is not a seeded consultant`);
      }
      const before = seededCras.length;
      await openSubmitValidate(consultant, periodIso);
      // `openSubmitValidate` pushed at most one entry (it never pushes one for a withheld
      // validation, which no historical period triggers — `withheldFromValidation` only ever
      // fires for `CRA_PERIOD`/`SUBMITTED_NOT_VALIDATED_EMAIL`).
      if (seededCras.length > before) {
        const pushed = seededCras[seededCras.length - 1];
        if (pushed !== undefined) {
          // Julien's 2022-06 (veteranIndex 0, periodIndex 3) is the one credit note this seed
          // writes — `docs/adr/0080-…` names it as the deliberate, sole exception to "several
          // different statuses" being carried by draft/issued alone. Every other even period
          // index is issued; every odd one is left as a draft backlog.
          if (veteranIndex === 0 && periodIndex === 3) {
            pushed.historicalOutcome = 'issuedThenCancelled';
          } else if (periodIndex % 2 === 0) {
            pushed.historicalOutcome = 'issued';
          }
        }
      }
      historicalCount++;
    }
    console.log(`Seeded ${String(historicalCount)} historical Cras from 2016.`);

    console.log(`Seeded ${String(seededCras.length)} validated CRAs in total.`);

    // ── Draft invoices through the billing domain ─────────────────────────

    // Build billing reference
    const billingClients = validatedClients.map((cl) =>
      clientFactory({
        id: cl.id,
        name: cl.name,
        siren: cl.siren,
        intraCommunityVatNumber: cl.intraCommunityVatNumber,
        territoriality: cl.territoriality,
        billingAddress: {
          line1: cl.billingAddress.street,
          line2: null,
          postalCode: cl.billingAddress.postalCode,
          city: cl.billingAddress.city,
          country: cl.billingAddress.country,
        },
        deliveryAddress: cl.deliveryAddress
          ? {
              line1: cl.deliveryAddress.street,
              line2: null,
              postalCode: cl.deliveryAddress.postalCode,
              city: cl.deliveryAddress.city,
              country: cl.deliveryAddress.country,
            }
          : null,
      }),
    );

    const billingMissions = validatedMissions
      .map((m) => {
        const tjmEntries = validatedMissionTjm
          .filter((t) => t.missionId === m.id)
          .map((t) => ({ from: t.fromDate, to: t.toDate, value: t.tjmCents }));
        if (tjmEntries.length === 0 && m.billingModel === 'Regie') return null;
        if (tjmEntries.length === 0) {
          // Forfait missions have no TJM — build with empty timeline
          return commercialMission({
            id: m.id,
            clientId: m.clientId,
            billingModel: m.billingModel,
            tjmCents: [],
          });
        }
        return commercialMission({
          id: m.id,
          clientId: m.clientId,
          billingModel: m.billingModel,
          tjmCents: tjmEntries,
        });
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    const billingRef = billingReference({
      missions: billingMissions,
      clients: billingClients,
    });

    const seller = legalEntityFactory({
      id: le.id,
      name: le.name,
      legalForm: le.legalForm,
      shareCapitalCents: le.shareCapitalCents,
      siren: le.siren,
      intraCommunityVatNumber: le.intraCommunityVatNumber,
      rcsRegistration: le.rcsRegistration,
      address: {
        line1: le.address.line1,
        line2: le.address.line2,
        postalCode: le.address.postalCode,
        city: le.address.city,
        country: le.address.country,
      },
      numberPrefix: le.numberPrefix,
    });

    const terms = paymentTerms({ kind: 'endOfMonth', days: 30 });
    const mentions = legalMentions({
      latePaymentBasisPoints: 1500,
      recoveryIndemnityCents: RECOVERY_INDEMNITY_CENTS,
      earlyPaymentDiscount: { kind: 'none' },
      operationCategory: 'services',
      vatOnDebitsOption: false,
    });

    let totalInvoices = 0;
    let totalDeclined = 0;
    let totalIssued = 0;
    let totalCancelled = 0;

    // Item 6 (QA round 1): who issues a historical invoice. Henri only (see `ISSUER_EMAIL`'s own
    // comment) — resolved once here rather than per iteration.
    const issuer = validatedConsultants.find((c) => c.email === ISSUER_EMAIL);
    if (issuer === undefined) {
      throw new SeedDataError(`Issuer ${ISSUER_EMAIL} is not a seeded consultant`);
    }
    const numberingCounter = new PgNumberingCounter(client);

    for (const { officeId, payload, historicalOutcome } of seededCras) {
      // Build the domain event
      const event: TimesheetValidated = {
        type: TIMESHEET_VALIDATED,
        version: TIMESHEET_VALIDATED_VERSION,
        occurredAt: clockInstantAfter(payload.period),
        correlationId: nextWriteId(),
        causationId: null,
        payload,
      };

      const dependencies: DraftInvoicesDependencies = {
        reference: billingRef,
        seller,
        terms,
        mentions,
        designation: ({ missionId, period: p }) => {
          const mission = validatedMissions.find((m) => m.id === missionId);
          const consultant = validatedConsultants.find((c) => c.id === payload.consultantId);
          const consultantName = consultant
            ? `${consultant.firstName} ${consultant.lastName}`
            : payload.consultantId;
          return `Prestation ${mission?.name ?? missionId} — ${consultantName} — ${p}`;
        },
        newInvoiceId: nextWriteId,
      };

      const result = draftInvoicesFrom(dependencies, event);

      for (const invoice of result.invoices) {
        await invoices.saveDraft(invoice, payload.craId);
        totalInvoices++;

        // Historical invoices only (item 6, QA round 1): draft is the default every dense-2026
        // invoice keeps (Alice's and Claire's own included, both load-bearing for
        // `apps/web/e2e/*.spec.ts` staying draft-and-present) — `historicalOutcome` opts a
        // specific historical Cra's invoice into `issued`, or `issued` then immediately
        // cancelled by a credit note, **through the domain**, in the same date order the Cras
        // themselves were opened in, so the gapless per-`(entity, fiscalYear)` numbering
        // (ADR-0007) is genuinely exercised rather than hand-assigned.
        if (historicalOutcome !== undefined) {
          const issueDate = isoDateInFirmTimeZone(clockInstantAfter(payload.period));
          const fiscalYear = Number.parseInt(issueDate.slice(0, 4), 10);
          const sequence = await numberingCounter.nextSequence(seller.id, fiscalYear);
          invoice.issue({ by: issuer.id, sequence, issueDate });
          totalIssued++;

          if (historicalOutcome === 'issuedThenCancelled') {
            const reason: CreditNoteReason = 'entryError';
            const cancelSequence = await numberingCounter.nextSequence(seller.id, fiscalYear);
            // `creditNote()` mutates `invoice` to `cancelledByCreditNote` as its last step; the
            // note itself is never persisted (migration 010, ADR-0057 dropped its table) — the
            // gap it leaves in `invoice_number` *is* the credit note, the only trace of a
            // never-materialised document this mockup does not build (README's own "Ce que je ne
            // construis pas").
            creditNote({
              id: nextWriteId(),
              invoice,
              reason,
              sequence: cancelSequence,
              issueDate,
            });
            totalCancelled++;
          }

          await invoices.save(invoice);
        }
      }

      // The days the validation carried that produced no line, with the reason (ADR-0037). The
      // seed wrote none of these until 21/08/2026, so a freshly seeded database showed an empty
      // blocking-reason column for a concept the domain models — the drift ADR-0022 warned about,
      // measured.
      await invoices.saveDeclinedDays(
        officeId,
        result.declined.map((entry) => ({
          craId: payload.craId,
          missionId: entry.missionId,
          quarterDays: entry.quarterDays,
          reason: entry.reason,
        })),
      );

      await events.persist(event);

      totalDeclined += result.declined.length;
    }

    await client.query('COMMIT');

    console.log(`Seeded ${String(totalInvoices)} invoices in total.`);
    console.log(
      `  of which ${String(totalIssued)} issued, ${String(totalCancelled)} cancelled by a credit note.`,
    );
    if (totalDeclined > 0) {
      console.log(`${String(totalDeclined)} mission(s) declined (Forfait or unrecognised).`);
    }
    console.log('Seed complete.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

seed().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
