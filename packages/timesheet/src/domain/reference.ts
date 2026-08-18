import type { IsoDate } from '@erp/platform';

import type { ConsultantId, MissionId } from './ids.ts';

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
}

export function timesheetReference(input: {
  missions: readonly Mission[];
  assignments: readonly Assignment[];
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
  };
}

/**
 * Both bounds are inclusive, and both are civil dates: a mission that ends on the 31st was worked
 * on the 31st. Comparison is lexicographic because `YYYY-MM-DD` sorts chronologically.
 */
function covers(span: { from: IsoDate; to: IsoDate | null }, date: IsoDate): boolean {
  return span.from <= date && (span.to === null || date <= span.to);
}
