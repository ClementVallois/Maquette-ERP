import { BusinessError } from '@erp/platform';

/**
 * The working calendar was asked about a year it does not hold. ADR-0004 keeps a written table
 * for 2026 alone and requires this to be loud: a silent answer would treat an unknown public
 * holiday as an ordinary working day, and bill it.
 */
export class UnknownCalendarYearError extends BusinessError {
  readonly problemType = '/problems/unknown-calendar-year';

  constructor(year: number, known: readonly number[]) {
    super(`the working calendar holds ${known.join(', ')} and was asked about ${String(year)}`, {
      year,
      known,
    });
  }
}

/** A worked day has to say which mission it was worked on: that is what becomes an invoice line. */
export class MissionRequiredError extends BusinessError {
  readonly problemType = '/problems/mission-required';

  constructor(day: string) {
    super(`a worked day names the mission it was worked on (${day})`, { day });
  }
}

/** An absence is not worked on a mission, so naming one would put a day of leave on an invoice. */
export class MissionOnNonWorkedDayError extends BusinessError {
  readonly problemType = '/problems/mission-not-allowed';

  constructor(day: string, dayType: string) {
    super(`a day recorded as ${dayType} carries no mission (${day})`, { day, dayType });
  }
}

/** A Cra records one month. A day outside it belongs to another Cra, or to none. */
export class DayOutsidePeriodError extends BusinessError {
  readonly problemType = '/problems/day-outside-period';

  constructor(day: string, period: string) {
    super(`${day} is not a day of ${period}`, { day, period });
  }
}

/** Nobody works three half-days in a day. Two lines of two half-days each is the classic double entry. */
export class DayOverbookedError extends BusinessError {
  readonly problemType = '/problems/day-overbooked';

  constructor(day: string, recorded: number, limit: number) {
    super(
      `${day} already carries ${String(recorded)} half-days, and a day holds ${String(limit)}`,
      {
        day,
        recorded,
        limit,
      },
    );
  }
}

/**
 * A validated Cra was asked to change. The legal reason is written into the message on purpose:
 * a Cra is a record of working time, and the record of a month that has been accepted — and
 * invoiced — is not edited afterwards. See ADR-0005.
 */
export class ValidatedCraIsImmutableError extends BusinessError {
  readonly problemType = '/problems/validated-cra-is-immutable';

  constructor(craId: string, attempted: string) {
    super(
      `a validated Cra is a record of working time and does not change (${craId}, attempted: ${attempted})`,
      { craId, attempted },
    );
  }
}

/** The transition asked for is not one the lifecycle has. See ADR-0005 for the four it does. */
export class CraTransitionError extends BusinessError {
  readonly problemType = '/problems/cra-transition-not-allowed';

  constructor(craId: string, from: string, attempted: string) {
    super(`a ${from} Cra cannot be ${attempted} (${craId})`, { craId, from, attempted });
  }
}

/** A refusal that says nothing is a refusal the consultant cannot act on. */
export class RefusalReasonRequiredError extends BusinessError {
  readonly problemType = '/problems/refusal-reason-required';

  constructor(craId: string) {
    super(`refusing a Cra says why (${craId})`, { craId });
  }
}

/** A day recorded on a mission the firm does not have. Usually a stale identifier on a form. */
export class UnknownMissionError extends BusinessError {
  readonly problemType = '/problems/unknown-mission';

  constructor(day: string, missionId: string) {
    super(`no mission ${missionId} to record ${day} on`, { day, missionId });
  }
}

/** A day recorded on a mission that had not started, or had already ended, on that day. */
export class MissionNotRunningError extends BusinessError {
  readonly problemType = '/problems/mission-not-running';

  constructor(day: string, missionId: string, startDate: string, endDate: string | null) {
    super(`mission ${missionId} does not run on ${day} (${startDate} to ${endDate ?? 'open'})`, {
      day,
      missionId,
      startDate,
      endDate,
    });
  }
}

/** A day recorded on a mission the consultant was not staffed on that day. */
export class NotAssignedError extends BusinessError {
  readonly problemType = '/problems/not-assigned';

  constructor(day: string, consultantId: string, missionId: string) {
    super(`${consultantId} is not assigned to ${missionId} on ${day}`, {
      day,
      consultantId,
      missionId,
    });
  }
}

/**
 * The month does not add up against the working calendar. Every workable day is accounted for —
 * worked or absent — or the Cra is not a record of the month, and the days nobody can explain are
 * the ones that quietly never get billed.
 */
export class IncompleteCraError extends BusinessError {
  readonly problemType = '/problems/cra-incomplete';

  constructor(input: {
    craId: string;
    missingDays: readonly string[];
    recordedHalfDays: number;
    expectedHalfDays: number;
  }) {
    super(
      `${input.craId} accounts for ${String(input.recordedHalfDays)} of ${String(input.expectedHalfDays)} half-days; ${String(input.missingDays.length)} workable days are not accounted for`,
      { ...input },
    );
  }
}

/**
 * The consultant who recorded the month asked to validate it. Separation of duties, first of the
 * two rules of ADR-0006: recording and accepting are different acts, and one person doing both
 * removes the only control between a keyboard and an invoice.
 */
export class SelfValidationForbiddenError extends BusinessError {
  readonly problemType = '/problems/self-validation-forbidden';

  constructor(craId: string, consultantId: string) {
    super(`${consultantId} recorded ${craId} and cannot validate it`, { craId, consultantId });
  }
}

/**
 * Someone other than the consultant's manager for that month asked to validate. Resolved against
 * the close of the period, not against today: March's Cra is March's manager's to accept
 * (ADR-0034).
 */
export class NotTheManagerError extends BusinessError {
  readonly problemType = '/problems/not-the-manager';

  constructor(input: {
    craId: string;
    consultantId: string;
    period: string;
    attempted: string;
    manager: string | null;
  }) {
    super(
      `${input.attempted} is not the manager of ${input.consultantId} for ${input.period}` +
        (input.manager === null ? ' (nobody was)' : ''),
      { ...input },
    );
  }
}
