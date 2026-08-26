import { type Actor, daysOf, type Period } from '@erp/platform';
import type { CraLine, CraStatus, NonWorkableDay } from '@erp/timesheet';

import { PgReferenceReader } from '../persistence/reference-reader.ts';
import type { UnitOfWork } from '../persistence/unit-of-work.ts';

/**
 * What `web/pages/cra-grid.ts` and `GET /api/v1/cras/:period/grid` (front-end plan Phase 5.2) both need: the
 * consultant's month, the missions they are staffed on inside it, and the Cra that already exists
 * for it — if one does.
 *
 * Extracted per ADR-0065. The screen still turns `lines` into a two-slot-per-day form
 * (`gridDays` in `web/pages/cra-grid.ts` — a fact about the HTML form, not about the month, so it
 * stays there); the API route exposes `lines` as recorded, which is what front-end plan Phase 5.2 asks for.
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
  /** `null` until the month has been saved once: there is no record to print yet. */
  readonly craId: string | null;
  readonly status: CraStatus | null;
  readonly lines: readonly CraLine[];
  readonly flags: readonly { day: string; reason: NonWorkableDay }[];
  readonly refusal: { reason: string } | null;
  /**
   * `draft` and `refused` are editable; `submitted` and `validated` are not, and the domain is the
   * one that says so (ADR-0005). Both callers read this fact rather than owning a second copy of
   * it — deriving it again from `status` in the SPA would be the duplication ADR-0065 exists to
   * name before it happens a second time.
   */
  readonly editable: boolean;
  readonly missions: readonly GridMission[];
  /**
   * Who accepted the month, `null` until it is validated. Task 6.4 of the front-end plan asked
   * for it on this composition and it was not carried — recorded as a gap in `open-questions.md`
   * on 25/08/2026 and corrected here, in the same task that renumbers the composition's other
   * fields.
   */
  readonly validatedBy: string | null;
}

export interface CraGridInput {
  readonly actor: Actor;
  readonly period: Period;
}

export async function craGridComposition(
  unit: UnitOfWork,
  input: CraGridInput,
): Promise<CraGridComposition> {
  const { actor, period } = input;

  const cra = await unit.cras.findByConsultantAndPeriod(actor.consultantId, period, actor);

  // Only the missions this consultant is staffed on during the month reach either caller. Not a
  // security control — the submission check is (ADR-0051) — but a form, or a dropdown, that offers
  // a mission the domain will refuse teaches the user nothing.
  const reference = new PgReferenceReader(unit.client);
  const timesheetReference = await reference.timesheet();
  const names = await reference.missionNames();
  const clientNames = await reference.missionClientNames();

  const periodDays = daysOf(period);

  const missions: GridMission[] = [...names]
    .map(([id, name]) => ({
      id,
      name,
      clientName: clientNames.get(id) ?? id,
      assignableDays: periodDays.filter((day) =>
        timesheetReference.isAssigned(actor.consultantId, id, day),
      ),
    }))
    .filter((mission) => mission.assignableDays.length > 0);

  return {
    craId: cra?.id ?? null,
    status: cra?.status ?? null,
    lines: cra?.lines ?? [],
    flags: cra?.flags ?? [],
    refusal:
      cra?.refusal === null || cra?.refusal === undefined ? null : { reason: cra.refusal.reason },
    editable: cra === null || cra.status === 'draft' || cra.status === 'refused',
    missions,
    validatedBy: cra?.validatedBy ?? null,
  };
}
