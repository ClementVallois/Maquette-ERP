import { STAFFING_PROBLEM_TYPES, type StaffingProblemType } from '@erp/contracts';
import { isoDate, isoDateOf, toDayNumber, type Actor, type IsoDate } from '@erp/platform';

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

interface HeldHabilitationRow {
  habilitation_id: string;
  obtained_at: Date | string;
  expires_at: Date | string | null;
}

function nullableDate(value: Date | string | null): IsoDate | null {
  return value === null ? null : isoDateOf(value);
}

/** `null` reads as unbounded — a day number no real date reaches. */
function dayNumberOrOpenEnd(date: IsoDate | null): number {
  return date === null ? Number.POSITIVE_INFINITY : toDayNumber(date);
}

/**
 * Whether the union of `periods` (each inclusive, `to: null` meaning open-ended) covers every day
 * of `[from, to]` with no gap — merging touching or overlapping periods rather than checking only
 * the two endpoints (ADR-0105). `periods` need not already be sorted or merged; this does both.
 */
function fullyCovers(
  periods: readonly { from: IsoDate; to: IsoDate | null }[],
  from: IsoDate,
  to: IsoDate | null,
): boolean {
  const targetFrom = toDayNumber(from);
  const targetTo = dayNumberOrOpenEnd(to);

  const sorted = [...periods]
    .map((period) => ({ from: toDayNumber(period.from), to: dayNumberOrOpenEnd(period.to) }))
    .sort((left, right) => left.from - right.from);

  // The last day number known covered so far, one day before the target's own start — so the
  // first period is accepted exactly when it starts on or before that start, with no gap.
  let coveredThrough = targetFrom - 1;
  for (const period of sorted) {
    if (period.from > coveredThrough + 1) return false;
    coveredThrough = Math.max(coveredThrough, period.to);
    if (coveredThrough >= targetTo) return true;
  }

  return coveredThrough >= targetTo;
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
  // `departure` is the first date the consultant is no longer staffable (ADR-0079's own wording),
  // so `>=` refuses the departure day itself, not only the days after it. An **open** end (`to ===
  // null`) is refused unconditionally once a departure is known: an unbounded assignment reaches
  // every future day by construction, and a known departure means at least one of them is already
  // not staffable — this was the gap the audit reproduced (an open end never compared to anything).
  if (departure !== null && (from >= departure || to === null || to >= departure)) {
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

  // `TimesheetReference.missingHabilitations` answers one day at a time — right for a Cra
  // submission check, which asks about one recorded day, but not enough here: an assignment
  // covers every day of `[from, to]`, and checking only the endpoints missed a held-then-lapsed-
  // then-renewed habilitation with a gap in the middle (reproduced: held July 1-5 and July 20-31,
  // assignment July 1-31, accepted). The raw dated rows are read directly and merged.
  const required = mission.requiredHabilitations;
  const missingNames: string[] = [];
  if (required.length > 0) {
    const { rows: heldRows } = await client.query<HeldHabilitationRow>(
      `SELECT habilitation_id, obtained_at, expires_at
         FROM public.consultant_habilitations
        WHERE consultant_id = $1 AND habilitation_id = ANY($2::text[])`,
      [input.consultantId, required],
    );
    const held = heldRows.map((row) => ({
      habilitationId: row.habilitation_id,
      from: isoDateOf(row.obtained_at),
      to: nullableDate(row.expires_at),
    }));

    for (const habilitationId of required) {
      const periods = held.filter((row) => row.habilitationId === habilitationId);
      if (!fullyCovers(periods, from, to)) missingNames.push(habilitationId);
    }
  }
  if (missingNames.length > 0) {
    const { rows: names } = await client.query<{ id: string; name: string }>(
      `SELECT id, name FROM public.habilitations WHERE id = ANY($1::text[]) ORDER BY name`,
      [missingNames],
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
