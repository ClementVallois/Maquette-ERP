import { QUARTER_DAYS_PER_DAY, type IsoDate, type Period } from '@erp/platform';

import type { CraLine } from './cra-line.ts';
import type { NonWorkableDay } from './day-type.ts';
import {
  IncompleteCraError,
  MissingHabilitationError,
  MissionNotRunningError,
  NotAssignedError,
  UnknownMissionError,
} from './errors.ts';
import type { ConsultantId, CraId } from './ids.ts';
import type { TimesheetReference } from './reference.ts';
import type { WorkingCalendar } from './working-calendar.ts';

/**
 * A day that was recorded although the calendar says it is not workable. Not a refusal: weekend
 * and holiday work happens in this business, and it is the manager's to accept. It is surfaced so
 * the decision is made rather than missed.
 */
export interface CraFlag {
  readonly day: IsoDate;
  readonly reason: NonWorkableDay;
}

/**
 * The rules a Cra has to pass to leave the consultant's hands. Each is a domain rule with a
 * negative test, and each refusal is typed and names the day it is about.
 *
 * Takes the record as data rather than the aggregate, so the aggregate can call it without the
 * two importing each other.
 */
export function runSubmissionChecks(input: {
  craId: CraId;
  consultantId: ConsultantId;
  period: Period;
  lines: readonly CraLine[];
  calendar: WorkingCalendar;
  reference: TimesheetReference;
}): CraFlag[] {
  const { calendar, reference } = input;
  const inDayOrder = [...input.lines].sort((left, right) => left.day.localeCompare(right.day));

  for (const line of inDayOrder) {
    if (line.missionId === null) continue;

    const mission = reference.mission(line.missionId);
    if (mission === null) throw new UnknownMissionError(line.day, line.missionId);

    if (!reference.runsOn(line.missionId, line.day)) {
      throw new MissionNotRunningError(
        line.day,
        line.missionId,
        mission.startDate,
        mission.endDate,
      );
    }

    if (!reference.isAssigned(input.consultantId, line.missionId, line.day)) {
      throw new NotAssignedError(line.day, input.consultantId, line.missionId);
    }

    // Last of the four, and deliberately after the assignment check: being staffed on a mission is
    // what makes "are you qualified for it" a question at all, and reporting the clearance first
    // would tell a consultant which certificates a mission needs before establishing that they
    // have any business asking.
    const missing = reference.missingHabilitations(input.consultantId, line.missionId, line.day);
    if (missing.length > 0) {
      throw new MissingHabilitationError(line.day, input.consultantId, line.missionId, missing);
    }
  }

  assertMonthAddsUp(input);

  return flagsFor(inDayOrder, calendar);
}

function assertMonthAddsUp(input: {
  craId: CraId;
  period: Period;
  lines: readonly CraLine[];
  calendar: WorkingCalendar;
}): void {
  const workable = input.calendar.workableDaysOf(input.period);
  const recordedPerDay = quarterDaysPerDay(input.lines);

  const missingDays = workable.filter(
    (day) => (recordedPerDay.get(day) ?? 0) < QUARTER_DAYS_PER_DAY,
  );
  if (missingDays.length === 0) return;

  const recordedQuarterDays = workable.reduce(
    (total, day) => total + (recordedPerDay.get(day) ?? 0),
    0,
  );

  throw new IncompleteCraError({
    craId: input.craId,
    missingDays,
    recordedQuarterDays,
    expectedQuarterDays: workable.length * QUARTER_DAYS_PER_DAY,
  });
}

function flagsFor(lines: readonly CraLine[], calendar: WorkingCalendar): CraFlag[] {
  const flagged = new Map<IsoDate, NonWorkableDay>();

  for (const line of lines) {
    const reason = calendar.nonWorkableReason(line.day);
    if (reason !== null) flagged.set(line.day, reason);
  }

  return [...flagged].map(([day, reason]) => ({ day, reason }));
}

function quarterDaysPerDay(lines: readonly CraLine[]): Map<IsoDate, number> {
  const total = new Map<IsoDate, number>();

  for (const line of lines) {
    total.set(line.day, (total.get(line.day) ?? 0) + line.quarterDays);
  }

  return total;
}
