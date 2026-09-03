import { STAFFING_PROBLEM_TYPES, type StaffingProblemType } from '@erp/contracts';
import { isoDate, isoDateOf, type Actor, type IsoDate } from '@erp/platform';

import type { PgReadClient } from '../persistence/pg-client.ts';
import { PgReferenceReader } from '../persistence/reference-reader.ts';

export interface AssignmentInput {
  readonly consultantId: string;
  readonly missionId: string;
  readonly fromDate: string;
  readonly toDate: string | null;
}

export interface AssignmentView extends AssignmentInput {
  readonly id: string;
  readonly consultantName: string;
  readonly missionName: string;
  readonly clientName: string;
}

export interface AssignmentCatalogue {
  readonly today: string;
  readonly assignments: readonly AssignmentView[];
  readonly consultants: readonly {
    readonly id: string;
    readonly name: string;
    readonly departureDate: string | null;
  }[];
  readonly missions: readonly {
    readonly id: string;
    readonly name: string;
    readonly clientName: string;
    readonly startDate: string;
    readonly endDate: string | null;
    readonly requiredHabilitations: readonly string[];
  }[];
}

export type AssignmentWriteOutcome =
  | { readonly kind: 'saved'; readonly id: string }
  | { readonly kind: 'notFound' }
  | {
      readonly kind: 'refused';
      readonly problemType: StaffingProblemType;
      readonly details: Readonly<Record<string, string>>;
    };

interface AssignmentRow {
  id: string;
  consultant_id: string;
  consultant_name: string;
  mission_id: string;
  mission_name: string;
  client_name: string;
  from_date: Date | string;
  to_date: Date | string | null;
}

interface ConsultantRow {
  id: string;
  name: string;
  departure_date: Date | string | null;
}

interface MissionRow {
  id: string;
  name: string;
  client_name: string;
  start_date: Date | string;
  end_date: Date | string | null;
}

interface RequirementRow {
  mission_id: string;
  name: string;
}

interface ScopedConsultantRow {
  departure_date: Date | string | null;
}

interface ExistsRow {
  exists: boolean;
}

function nullableDate(value: Date | string | null): IsoDate | null {
  return value === null ? null : isoDateOf(value);
}

export async function assignmentCatalogue(
  client: PgReadClient,
  actor: Actor,
  today: string,
): Promise<AssignmentCatalogue> {
  const { rows: assignments } = await client.query<AssignmentRow>(
    `SELECT a.id, a.consultant_id,
            c.first_name || ' ' || c.last_name AS consultant_name,
            a.mission_id, m.name AS mission_name, clients.name AS client_name,
            a.from_date, a.to_date
       FROM public.assignments a
       JOIN public.consultants c ON c.id = a.consultant_id
       JOIN public.missions m ON m.id = a.mission_id
       JOIN public.clients clients ON clients.id = m.client_id
      WHERE c.office_id = $1
      ORDER BY a.to_date NULLS FIRST, c.last_name, c.first_name, m.name, a.from_date`,
    [actor.officeId],
  );
  const { rows: consultants } = await client.query<ConsultantRow>(
    `SELECT id, first_name || ' ' || last_name AS name, departure_date
       FROM public.consultants
      WHERE office_id = $1 AND role = 'consultant'
      ORDER BY last_name, first_name`,
    [actor.officeId],
  );
  const { rows: missions } = await client.query<MissionRow>(
    `SELECT m.id, m.name, clients.name AS client_name, m.start_date, m.end_date
       FROM public.missions m
       JOIN public.clients clients ON clients.id = m.client_id
      ORDER BY clients.name, m.name`,
  );
  const { rows: requirements } = await client.query<RequirementRow>(
    `SELECT mh.mission_id, h.name
       FROM public.mission_habilitations mh
       JOIN public.habilitations h ON h.id = mh.habilitation_id
      ORDER BY h.name`,
  );

  return {
    today,
    assignments: assignments.map((row) => ({
      id: row.id,
      consultantId: row.consultant_id,
      consultantName: row.consultant_name,
      missionId: row.mission_id,
      missionName: row.mission_name,
      clientName: row.client_name,
      fromDate: isoDateOf(row.from_date),
      toDate: nullableDate(row.to_date),
    })),
    consultants: consultants.map((row) => ({
      id: row.id,
      name: row.name,
      departureDate: nullableDate(row.departure_date),
    })),
    missions: missions.map((row) => ({
      id: row.id,
      name: row.name,
      clientName: row.client_name,
      startDate: isoDateOf(row.start_date),
      endDate: nullableDate(row.end_date),
      requiredHabilitations: requirements
        .filter((requirement) => requirement.mission_id === row.id)
        .map((requirement) => requirement.name),
    })),
  };
}

function refused(
  problemType: StaffingProblemType,
  details: Readonly<Record<string, string>>,
): AssignmentWriteOutcome {
  return { kind: 'refused', problemType, details };
}

async function validateAssignment(
  client: PgReadClient,
  actor: Actor,
  input: AssignmentInput,
  excludedId: string | null,
): Promise<AssignmentWriteOutcome | null> {
  const from = isoDate(input.fromDate);
  const to = input.toDate === null ? null : isoDate(input.toDate);
  if (to !== null && to < from) {
    return refused(STAFFING_PROBLEM_TYPES.invalidRange, {
      fromDate: from,
      toDate: to,
    });
  }

  const { rows: consultants } = await client.query<ScopedConsultantRow>(
    `SELECT departure_date
       FROM public.consultants
      WHERE id = $1 AND office_id = $2 AND role = 'consultant'`,
    [input.consultantId, actor.officeId],
  );
  const consultant = consultants[0];
  if (consultant === undefined) return { kind: 'notFound' };

  const departure = nullableDate(consultant.departure_date);
  if (departure !== null && (from >= departure || (to !== null && to >= departure))) {
    return refused(STAFFING_PROBLEM_TYPES.departure, { departureDate: departure });
  }

  const reference = await new PgReferenceReader(client).timesheet();
  const mission = reference.mission(input.missionId);
  if (mission === null) return { kind: 'notFound' };
  if (
    !reference.runsOn(input.missionId, from) ||
    (to !== null && !reference.runsOn(input.missionId, to))
  ) {
    return refused(STAFFING_PROBLEM_TYPES.missionDates, {
      missionStartDate: mission.startDate,
      missionEndDate: mission.endDate ?? '',
    });
  }
  if (to === null && mission.endDate !== null) {
    return refused(STAFFING_PROBLEM_TYPES.missionDates, {
      missionStartDate: mission.startDate,
      missionEndDate: mission.endDate,
    });
  }

  const missing = new Set([
    ...reference.missingHabilitations(input.consultantId, input.missionId, from),
    ...reference.missingHabilitations(
      input.consultantId,
      input.missionId,
      to ?? isoDate('9999-12-31'),
    ),
  ]);
  if (missing.size > 0) {
    const { rows: names } = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM public.habilitations WHERE id = ANY($1::text[]) ORDER BY name`,
      [[...missing]],
    );
    return refused(STAFFING_PROBLEM_TYPES.missingHabilitation, {
      habilitations: names.map((row) => row.name).join(', '),
    });
  }

  const { rows: overlaps } = await client.query<ExistsRow>(
    `SELECT EXISTS (
       SELECT 1 FROM public.assignments
        WHERE consultant_id = $1 AND mission_id = $2
          AND ($5::text IS NULL OR id <> $5)
          AND from_date <= COALESCE($4::date, 'infinity'::date)
          AND COALESCE(to_date, 'infinity'::date) >= $3::date
     ) AS exists`,
    [input.consultantId, input.missionId, from, to, excludedId],
  );
  if (overlaps[0]?.exists === true) {
    return refused(STAFFING_PROBLEM_TYPES.overlap, {});
  }

  return null;
}

export async function createAssignment(
  client: PgReadClient,
  actor: Actor,
  newId: () => string,
  input: AssignmentInput,
): Promise<AssignmentWriteOutcome> {
  const refusal = await validateAssignment(client, actor, input, null);
  if (refusal !== null) return refusal;

  const id = newId();
  await client.query(
    `INSERT INTO public.assignments (id, consultant_id, mission_id, from_date, to_date)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.consultantId, input.missionId, input.fromDate, input.toDate],
  );
  return { kind: 'saved', id };
}

export async function updateAssignment(
  client: PgReadClient,
  actor: Actor,
  id: string,
  input: AssignmentInput,
): Promise<AssignmentWriteOutcome> {
  const { rows: existingRows } = await client.query<{ consultant_id: string; mission_id: string }>(
    `SELECT a.consultant_id, a.mission_id
       FROM public.assignments a
       JOIN public.consultants c ON c.id = a.consultant_id
      WHERE a.id = $1 AND c.office_id = $2`,
    [id, actor.officeId],
  );
  const existing = existingRows[0];
  if (existing === undefined) return { kind: 'notFound' };
  if (existing.consultant_id !== input.consultantId || existing.mission_id !== input.missionId) {
    return refused(STAFFING_PROBLEM_TYPES.invalidRange, {});
  }

  const refusal = await validateAssignment(client, actor, input, id);
  if (refusal !== null) return refusal;

  const { rows: recordedDays } = await client.query<ExistsRow>(
    `SELECT EXISTS (
       SELECT 1
         FROM timesheet.cra_lines line
         JOIN timesheet.cras cra ON cra.id = line.cra_id
        WHERE cra.consultant_id = $1 AND line.mission_id = $2
          AND (line.day < $3::date OR ($4::date IS NOT NULL AND line.day > $4::date))
     ) AS exists`,
    [input.consultantId, input.missionId, input.fromDate, input.toDate],
  );
  if (recordedDays[0]?.exists === true) {
    return refused(STAFFING_PROBLEM_TYPES.recordedDays, {});
  }

  await client.query(`UPDATE public.assignments SET from_date = $2, to_date = $3 WHERE id = $1`, [
    id,
    input.fromDate,
    input.toDate,
  ]);
  return { kind: 'saved', id };
}
