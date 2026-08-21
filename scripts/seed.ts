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
  draftInvoicesFrom,
  type DraftInvoicesDependencies,
  legalEntity as legalEntityFactory,
  legalMentions,
  paymentTerms,
  PgInvoiceRepository,
  RECOVERY_INDEMNITY_CENTS,
} from '@erp/billing';
import {
  type Clock,
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
  consultantGrades,
  consultantHabilitations,
  consultants,
  CRA_PERIOD,
  gradeTjmDefaults,
  grades,
  habilitations,
  internalClient,
  legalEntityData,
  managerAttachments,
  missionHabilitations,
  missions,
  missionTjm,
  offices,
  personas,
  practices,
  SEED_CLOCK_INSTANT,
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

const ConsultantSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.email(),
  officeId: z.string(),
  practiceId: z.string(),
  role: z.enum(['consultant', 'manager', 'director']),
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

const IsoDateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

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
    await client.query('DELETE FROM billing.credit_notes');
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
        `INSERT INTO public.consultants (id, first_name, last_name, email, office_id, practice_id, role)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [c.id, c.firstName, c.lastName, c.email, c.officeId, c.practiceId, c.role],
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

    const clock: Clock = { now: () => SEED_CLOCK_INSTANT };
    const calendar = workingCalendar();
    const period = periodFromIso(CRA_PERIOD);

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

    // Determine which consultants should have CRAs for June 2026.
    // Every consultant (not managers or directors unless they also consult) gets a CRA.
    // For the seed, every consultant + manager + director gets a CRA.
    const consultantsWithCras = validatedConsultants.filter((c) => {
      // Find this consultant's assignments for June 2026
      const hasAssignment = validatedAssignments.some(
        (a) =>
          a.consultantId === c.id &&
          a.fromDate <= '2026-06-30' &&
          (a.toDate === null || a.toDate >= '2026-06-01'),
      );
      // A consultant needs a CRA if they are assigned to at least one mission
      // and they have a manager attachment
      const hasManager = validatedManagerAttachments.some(
        (ma) =>
          ma.consultantId === c.id &&
          ma.fromDate <= '2026-06-30' &&
          (ma.toDate === null || ma.toDate >= '2026-06-01'),
      );
      return hasAssignment && hasManager;
    });

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
    const workableDays = calendar.workableDaysOf(period);

    const seededCras: {
      officeId: string;
      payload: TimesheetValidatedPayload;
    }[] = [];

    for (const consultant of consultantsWithCras) {
      const craId = nextWriteId();

      const cra = Cra.open({
        id: craId,
        consultantId: consultant.id,
        officeId: consultant.officeId,
        period,
      });

      // Find the consultant's assignments for this period
      const activeAssignments = validatedAssignments.filter(
        (a) =>
          a.consultantId === consultant.id &&
          a.fromDate <= '2026-06-30' &&
          (a.toDate === null || a.toDate >= '2026-06-01'),
      );

      // Record every workable day as worked on the first active assignment — except for the one
      // consultant whose month is deliberately varied (VARIED_MONTH), so that a split day, an
      // absence and a flagged Saturday exist in the data the screens render rather than only in
      // the model that permits them.
      const primaryAssignment = activeAssignments[0];
      const secondAssignment = activeAssignments[1];
      const varied = consultant.email === VARIED_MONTH.email;

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
            cra.recordDay({ day, dayType: 'absence', missionId: null, halfDays: 2 });
            continue;
          }

          if (varied && day === VARIED_MONTH.splitDay && secondAssignment !== undefined) {
            cra.recordDay({
              day,
              dayType: 'worked',
              missionId: primaryAssignment.missionId,
              halfDays: 1,
            });
            cra.recordDay({
              day,
              dayType: 'worked',
              missionId: secondAssignment.missionId,
              halfDays: 1,
            });
            continue;
          }

          cra.recordDay({
            day,
            dayType: 'worked',
            missionId: primaryAssignment.missionId,
            halfDays: 2,
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
            halfDays: 2,
          });
        }
      }

      cra.submit({ clock, calendar, reference: tsRef });

      const manager = mgmtHierarchy.managerOf(consultant.id, period);
      if (manager === null) {
        throw new SeedDataError(
          `No manager found for consultant ${consultant.id} in ${CRA_PERIOD}`,
        );
      }

      // One Cra stops at `submitted`, on purpose: a dataset where every month is already
      // validated leaves the chain describable and not performable. This is the one the demo
      // validates, and it is why an invoice appears while somebody is watching.
      if (consultant.email !== SUBMITTED_NOT_VALIDATED_EMAIL) {
        const payload = cra.validate({ by: manager, clock, hierarchy: mgmtHierarchy });

        seededCras.push({ officeId: consultant.officeId, payload });
      }

      await cras.save(cra);
    }

    console.log(`Seeded ${String(seededCras.length)} validated CRAs for ${CRA_PERIOD}.`);

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

    for (const { officeId, payload } of seededCras) {
      // Build the domain event
      const event: TimesheetValidated = {
        type: TIMESHEET_VALIDATED,
        version: TIMESHEET_VALIDATED_VERSION,
        occurredAt: SEED_CLOCK_INSTANT,
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
          return `Prestation ${mission?.name ?? missionId} — ${p}`;
        },
        newInvoiceId: nextWriteId,
      };

      const result = draftInvoicesFrom(dependencies, event);

      for (const invoice of result.invoices) {
        await invoices.saveDraft(invoice, payload.craId);
        totalInvoices++;
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
          halfDays: entry.halfDays,
          reason: entry.reason,
        })),
      );

      await events.persist(event);

      totalDeclined += result.declined.length;
    }

    await client.query('COMMIT');

    console.log(`Seeded ${String(totalInvoices)} draft invoices.`);
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
