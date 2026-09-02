import { type Actor, assertMayRead, daysOf, type Period } from '@erp/platform';
import type { CraLine, CraStatus, NonWorkableDay } from '@erp/timesheet';

import { PgReferenceReader } from '../persistence/reference-reader.ts';
import type { UnitOfWork } from '../persistence/unit-of-work.ts';

/**
 * What `web/pages/cra-grid.ts`, `GET /api/v1/cras/:period/grid` (front-end plan Phase 5.2) and
 * `GET /api/v1/consultants/:consultantId/cras/:period/grid` (ADR-0071) all need: one consultant's
 * month, the missions they are staffed on inside it, and the Cra that already exists for it — if
 * one does.
 *
 * Extracted per ADR-0065. The screen still turns `lines` into a two-slot-per-day form
 * (`gridDays` in `web/pages/cra-grid.ts` — a fact about the HTML form, not about the month, so it
 * stays there); the API route exposes `lines` as recorded, which is what front-end plan Phase 5.2 asks for.
 *
 * ADR-0071 generalised this from "the caller's own month" to "a named consultant's month, if the
 * caller's role and office reach that far" — the consultant route passes `actor.consultantId`, the
 * manager route passes a path parameter, and this function no longer assumes the two are the same
 * person.
 */

export interface GridMission {
  readonly id: string;
  readonly name: string;
  readonly clientName: string;
  /**
   * The days of the month this consultant is staffed on this mission. What lets the matrix
   * (ADR-0070) grey out a cell rather than let a write fail at submission — a mission that starts
   * on the 15th is offered for the whole month, and the days before it started are the ones this
   * field marks unassignable. Computed the same way the mission list itself is already filtered:
   * `timesheetReference.isAssigned`, day by day, nothing new.
   */
  readonly assignableDays: readonly string[];
}

export interface CraGridComposition {
  readonly consultantId: string;
  readonly consultantName: string;
  /** `null` until the month has been saved once: there is no record to print yet. */
  readonly craId: string | null;
  readonly status: CraStatus | null;
  readonly lines: readonly CraLine[];
  readonly flags: readonly { day: string; reason: NonWorkableDay }[];
  readonly submittedAt: string | null;
  readonly refusal: { reason: string; at: string; by: string } | null;
  /**
   * `draft` and `refused` are editable; `submitted` and `validated` are not, and the domain is the
   * one that says so (ADR-0005). Both callers read this fact rather than owning a second copy of
   * it — deriving it again from `status` in the SPA would be the duplication ADR-0065 exists to
   * name before it happens a second time.
   *
   * This is "could the **consultant** edit this", never "may the caller edit this" — a manager
   * reading someone else's month through ADR-0071's route ignores this field entirely and renders
   * read-only regardless of its value, because a manager never edits a consultant's CRA
   * (BUILD-RULES: separation of duties).
   */
  readonly editable: boolean;
  readonly missions: readonly GridMission[];
  /**
   * Who accepted the month, `null` until it is validated — a **display name**, not the raw
   * `ConsultantId` the aggregate carries (resolved below, the same way `consultantName` is).
   * Task 6.4 of the front-end plan asked for it on this composition and it was not carried —
   * recorded as a gap in `open-questions.md` on 25/08/2026 and corrected as a raw id; the name
   * resolution was added afterwards, once the SPA's own "validated" banner needed to print it
   * (task 6.6: "une bannière nommant `validatedBy`" reads oddly naming a UUID).
   */
  readonly validatedBy: string | null;
  readonly validatedAt: string | null;
}

export interface CraGridInput {
  readonly actor: Actor;
  readonly period: Period;
  /**
   * The consultant whose month this reads — **not necessarily the actor** (ADR-0071). The
   * consultant route passes `actor.consultantId`; the manager route passes a path parameter, and
   * the scope check below is what a manager asking about the wrong office fails on.
   */
  readonly consultantId: string;
}

interface ConsultantRow {
  office_id: string;
  first_name: string;
  last_name: string;
}

/**
 * `null` means no such consultant exists — a 404, distinct from `OutOfScopeError`'s 403
 * (ADR-0003's "does not exist" vs. "exists, not yours", extended to the subject and not only the
 * record).
 */
export async function craGridComposition(
  unit: UnitOfWork,
  input: CraGridInput,
): Promise<CraGridComposition | null> {
  const { actor, period, consultantId } = input;

  const { rows } = await unit.client.query<ConsultantRow>(
    `SELECT office_id, first_name, last_name FROM public.consultants WHERE id = $1`,
    [consultantId],
  );
  const consultant = rows[0];
  if (consultant === undefined) return null;

  // Before any line, mission or client name is read. ADR-0071: this has to run whether or not a
  // Cra row exists for the month, which is why it is here and not left to
  // `findByConsultantAndPeriod`'s own check (that one only fires once a row is found — exactly the
  // gap a manager asking about a not-yet-started month would otherwise fall through).
  assertMayRead(actor, 'cra', { officeId: consultant.office_id, subjectId: consultantId });

  const cra = await unit.cras.findByConsultantAndPeriod(consultantId, period, actor);

  // Only the missions this consultant is staffed on during the month reach either caller. Not a
  // security control — the submission check is (ADR-0051) — but a form, or a dropdown, that offers
  // a mission the domain will refuse teaches the user nothing.
  const reference = new PgReferenceReader(unit.client);
  const timesheetReference = await reference.timesheet();
  const names = await reference.missionNames();
  const clientNames = await reference.missionClientNames();
  // `validatedBy` is a `ConsultantId` on the aggregate — resolved to a display name here, the
  // same way `consultantName` above already is, so the grid's own "validated" banner can name
  // who validated it without the caller carrying a raw UUID (frontend-plan.md task 6.6: "une
  // bannière nommant validatedBy"). Falls back to the id if the row is ever missing, same as
  // every other name lookup in this file.
  const consultantNames = await reference.consultantNames();

  const periodDays = daysOf(period);

  const missions: GridMission[] = [...names]
    .map(([id, name]) => ({
      id,
      name,
      clientName: clientNames.get(id) ?? id,
      assignableDays: periodDays.filter((day) =>
        timesheetReference.isAssigned(consultantId, id, day),
      ),
    }))
    .filter((mission) => mission.assignableDays.length > 0);

  return {
    consultantId,
    consultantName: `${consultant.first_name} ${consultant.last_name}`,
    craId: cra?.id ?? null,
    status: cra?.status ?? null,
    lines: cra?.lines ?? [],
    flags: cra?.flags ?? [],
    submittedAt: cra?.submittedAt?.toISOString() ?? null,
    refusal:
      cra?.refusal === null || cra?.refusal === undefined
        ? null
        : {
            reason: cra.refusal.reason,
            at: cra.refusal.at.toISOString(),
            by: consultantNames.get(cra.refusal.by) ?? cra.refusal.by,
          },
    editable: cra === null || cra.status === 'draft' || cra.status === 'refused',
    missions,
    validatedBy:
      cra?.validatedBy === null || cra?.validatedBy === undefined
        ? null
        : (consultantNames.get(cra.validatedBy) ?? cra.validatedBy),
    validatedAt: cra?.validatedAt?.toISOString() ?? null,
  };
}
