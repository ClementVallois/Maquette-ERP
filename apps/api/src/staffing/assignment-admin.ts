import {
  STAFFING_PROBLEM_TYPES,
  type AssignmentCatalogue,
  type AssignmentInput,
  type StaffingProblemType,
} from '@erp/contracts';
import { isoDate, isoDateOf, type Actor, type IsoDate } from '@erp/platform';
import {
  assignmentIntervalOrder,
  assignmentPolicy,
  type AssignmentPolicyRefusal,
} from '@erp/timesheet';

import type { PgReadClient } from '../persistence/pg-client.ts';

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

interface HeldHabilitationRow {
  habilitation_id: string;
  obtained_at: Date | string;
  expires_at: Date | string | null;
}

interface PolicyMissionRow {
  start_date: Date | string;
  end_date: Date | string | null;
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

function policyRefusal(
  outcome: Exclude<AssignmentPolicyRefusal, { readonly kind: 'missingHabilitations' }>,
): AssignmentWriteOutcome {
  switch (outcome.kind) {
    case 'invalidRange':
      return refused(STAFFING_PROBLEM_TYPES.invalidRange, {
        fromDate: outcome.from,
        toDate: outcome.to,
      });
    case 'departure':
      return refused(STAFFING_PROBLEM_TYPES.departure, {
        departureDate: outcome.departureDate,
      });
    case 'missionDates':
      return refused(STAFFING_PROBLEM_TYPES.missionDates, {
        missionStartDate: outcome.missionStartDate,
        missionEndDate: outcome.missionEndDate ?? '',
      });
  }
}

async function validateAssignment(
  client: PgReadClient,
  actor: Actor,
  input: AssignmentInput,
  excludedId: string | null,
): Promise<AssignmentWriteOutcome | null> {
  const from = isoDate(input.fromDate);
  const to = input.toDate === null ? null : isoDate(input.toDate);
  const invalidRange = assignmentIntervalOrder(from, to);
  if (invalidRange !== null) return policyRefusal(invalidRange);

  // ADR-0106: serializes every create/update for this (consultant, mission) pair before the
  // overlap check below reads anything, closing the check-then-insert race two concurrent
  // requests could otherwise both pass. Held for the rest of this transaction (`_xact_lock`), so
  // it also covers `updateAssignment`'s recorded-days check, which runs after this function
  // returns but inside the same transaction. The `':'`-joined key relies on both ids being
  // UUIDs (no colon can appear in one), so two distinct pairs can never concatenate to the same
  // string and coalesce onto one lock.
  await client.query(
    `SELECT pg_advisory_xact_lock(hashtext('staffing.assignment.write'), hashtext($1 || ':' || $2))`,
    [input.consultantId, input.missionId],
  );

  const { rows: consultants } = await client.query<ScopedConsultantRow>(
    `SELECT departure_date
       FROM public.consultants
      WHERE id = $1 AND office_id = $2 AND role = 'consultant'`,
    [input.consultantId, actor.officeId],
  );
  const consultant = consultants[0];
  if (consultant === undefined) return { kind: 'notFound' };

  const departure = nullableDate(consultant.departure_date);

  const { rows: missions } = await client.query<PolicyMissionRow>(
    `SELECT start_date, end_date FROM public.missions WHERE id = $1`,
    [input.missionId],
  );
  const mission = missions[0];
  if (mission === undefined) return { kind: 'notFound' };

  const { rows: requirementRows } = await client.query<{ habilitation_id: string }>(
    `SELECT habilitation_id FROM public.mission_habilitations WHERE mission_id = $1`,
    [input.missionId],
  );
  const required = requirementRows.map((row) => row.habilitation_id);
  const { rows: heldRows } = await client.query<HeldHabilitationRow>(
    `SELECT habilitation_id, obtained_at, expires_at
       FROM public.consultant_habilitations
      WHERE consultant_id = $1 AND habilitation_id = ANY($2::text[])`,
    [input.consultantId, required],
  );

  const policy = assignmentPolicy({
    from,
    to,
    departureDate: departure,
    mission: {
      startDate: isoDateOf(mission.start_date),
      endDate: nullableDate(mission.end_date),
      requiredHabilitations: required,
    },
    heldHabilitations: heldRows.map((row) => ({
      id: row.habilitation_id,
      from: isoDateOf(row.obtained_at),
      to: nullableDate(row.expires_at),
    })),
  });
  if (policy?.kind === 'missingHabilitations') {
    const { rows: names } = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM public.habilitations WHERE id = ANY($1::text[]) ORDER BY name`,
      [policy.ids],
    );
    return refused(STAFFING_PROBLEM_TYPES.missingHabilitation, {
      habilitations: names.map((row) => row.name).join(', '),
    });
  }
  if (policy !== null) return policyRefusal(policy);

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

  // A recorded day is only at risk if this edit's own new range no longer covers it AND no
  // *other* assignment on the same (consultant, mission) covers it either (package 05): the
  // original query compared every recorded day only to this assignment's own new range, so a
  // disjoint historical assignment on the same mission (e.g. January, still covering its own
  // recorded days unchanged) blocked an edit to an unrelated one (e.g. July). Two assignments on
  // the same mission cannot overlap in time (the overlap check above forbids it), so "another
  // assignment covers this day" and "this edit's own new range covers this day" are mutually
  // exclusive by construction — this query is still exactly the "would this day lose its only
  // covering assignment" question the audit asked for.
  const { rows: recordedDays } = await client.query<ExistsRow>(
    `SELECT EXISTS (
       SELECT 1
         FROM timesheet.cra_lines line
         JOIN timesheet.cras cra ON cra.id = line.cra_id
        WHERE cra.consultant_id = $1 AND line.mission_id = $2
          AND NOT (line.day >= $3::date AND line.day <= COALESCE($4::date, 'infinity'::date))
          AND NOT EXISTS (
            SELECT 1 FROM public.assignments other
             WHERE other.consultant_id = $1 AND other.mission_id = $2
               AND other.id <> $5
               AND other.from_date <= line.day
               AND COALESCE(other.to_date, 'infinity'::date) >= line.day
          )
     ) AS exists`,
    [input.consultantId, input.missionId, input.fromDate, input.toDate, id],
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
