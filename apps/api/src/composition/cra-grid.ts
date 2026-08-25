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

  const missions: GridMission[] = [...names]
    .filter(([id]) =>
      daysOf(period).some((day) => timesheetReference.isAssigned(actor.consultantId, id, day)),
    )
    .map(([id, name]) => ({ id, name, clientName: clientNames.get(id) ?? id }));

  return {
    craId: cra?.id ?? null,
    status: cra?.status ?? null,
    lines: cra?.lines ?? [],
    flags: cra?.flags ?? [],
    refusal:
      cra?.refusal === null || cra?.refusal === undefined ? null : { reason: cra.refusal.reason },
    editable: cra === null || cra.status === 'draft' || cra.status === 'refused',
    missions,
  };
}
