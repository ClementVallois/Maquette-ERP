import type { IsoDate } from '@erp/platform';

import type { ConsultantId, HabilitationId, MissionId } from './ids.ts';

/**
 * What `timesheet` knows about a mission: when it runs. Not what it costs, not who the client is,
 * not how it is billed — `billing` holds that side, and the two never import each other
 * (ADR-0031). The seed writes both from the same UUIDs, which is what makes the duplication safe.
 */
export interface Mission {
  readonly id: MissionId;
  readonly startDate: IsoDate;
  /** Open-ended while the mission is running. */
  readonly endDate: IsoDate | null;
  /**
   * The `Habilitation`s a consultant must hold to be staffed on this mission — a PASSI-qualified
   * audit is the seeded case. Usually empty. It is here rather than in `billing` because it
   * constrains *who may record a day*, which is a timesheet rule; what the mission is worth is the
   * other module's projection (ADR-0031).
   */
  readonly requiredHabilitations: readonly HabilitationId[];
}

/**
 * An `Habilitation` a consultant holds, with its validity. Dated for the same reason the `Tjm` and
 * the manager attachment are: a qualification expires, and a day worked in June is judged against
 * June's certificate, not against today's.
 */
export interface HeldHabilitation {
  readonly consultantId: ConsultantId;
  readonly habilitationId: HabilitationId;
  readonly from: IsoDate;
  /** Open-ended for a qualification with no expiry date. */
  readonly to: IsoDate | null;
}

/**
 * The dated staffing of a consultant on a mission. Dated, because a consultant leaves a mission
 * and joins another mid-month: what may be recorded on the 3rd is not what may be recorded on
 * the 25th.
 */
export interface Assignment {
  readonly consultantId: ConsultantId;
  readonly missionId: MissionId;
  readonly from: IsoDate;
  /** Open-ended while the consultant is still staffed. */
  readonly to: IsoDate | null;
}

/**
 * The reference data a Cra is checked against, as a snapshot handed to the domain rather than a
 * port it calls: the domain performs no I/O, and a submission check is a pure function of the
 * record and the reference at that instant.
 */
export interface TimesheetReference {
  mission(id: MissionId): Mission | null;
  runsOn(id: MissionId, date: IsoDate): boolean;
  isAssigned(consultantId: ConsultantId, missionId: MissionId, date: IsoDate): boolean;
  /**
   * The `Habilitation`s the mission requires and the consultant does not hold on that day.
   *
   * It returns the missing ones rather than a boolean, and that is the whole reason it is shaped
   * this way: a refusal has to name what is missing, or the consultant is told "no" and left to
   * guess which certificate to go and get.
   */
  missingHabilitations(
    consultantId: ConsultantId,
    missionId: MissionId,
    date: IsoDate,
  ): readonly HabilitationId[];
}

export function timesheetReference(input: {
  missions: readonly Mission[];
  assignments: readonly Assignment[];
  held?: readonly HeldHabilitation[];
}): TimesheetReference {
  const missions = new Map(input.missions.map((mission) => [mission.id, mission]));

  return {
    mission(id) {
      return missions.get(id) ?? null;
    },

    runsOn(id, date) {
      const mission = missions.get(id);
      if (mission === undefined) return false;

      return covers({ from: mission.startDate, to: mission.endDate }, date);
    },

    isAssigned(consultantId, missionId, date) {
      return input.assignments.some(
        (assignment) =>
          assignment.consultantId === consultantId &&
          assignment.missionId === missionId &&
          covers(assignment, date),
      );
    },

    missingHabilitations(consultantId, missionId, date) {
      const required = missions.get(missionId)?.requiredHabilitations ?? [];
      if (required.length === 0) return [];

      return required.filter(
        (habilitationId) =>
          !(input.held ?? []).some(
            (holding) =>
              holding.consultantId === consultantId &&
              holding.habilitationId === habilitationId &&
              covers(holding, date),
          ),
      );
    },
  };
}

/**
 * Both bounds are inclusive, and both are civil dates: a mission that ends on the 31st was worked
 * on the 31st. Comparison is lexicographic because `YYYY-MM-DD` sorts chronologically.
 */
function covers(span: { from: IsoDate; to: IsoDate | null }, date: IsoDate): boolean {
  return span.from <= date && (span.to === null || date <= span.to);
}
