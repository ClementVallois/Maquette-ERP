import { BusinessError, TechnicalFailure } from '@erp/platform';

/**
 * The working calendar was asked about a year it does not hold. ADR-0004 keeps a written table —
 * 2016–2027 since ADR-0078 extended it — and requires this to be loud: a silent answer would
 * treat an unknown public holiday as an ordinary working day, and bill it.
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

/**
 * A CRA was opened for a period that starts after the consultant's own departure (ADR-0079). The
 * value is fine — the period is real — and it is the consultant's state as of that date that
 * refuses it, the same reasoning `MissingHabilitationError` gives for its own 409.
 */
export class CraAfterDepartureError extends BusinessError {
  readonly problemType = '/problems/cra-after-departure';

  constructor(period: string, departure: string) {
    super(`${period} starts after the consultant's own departure (${departure})`, {
      period,
      departure,
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

/** Nobody works more than a full day. Two lines of four quarter-days each is the classic double entry. */
export class DayOverbookedError extends BusinessError {
  readonly problemType = '/problems/day-overbooked';

  constructor(day: string, recorded: number, limit: number) {
    super(
      `${day} already carries ${String(recorded)} quarter-days, and a day holds ${String(limit)}`,
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
 * A day recorded on a mission that requires an `Habilitation` the consultant did not hold on that
 * day. It is a 409 and not a 422 for the reason ADR-0042 gives: the day and the mission are both
 * perfectly good values, and what refuses them is the state of the world on that date.
 *
 * The missing clearances are named. A refusal that says only "not qualified" leaves the consultant
 * to guess which certificate to go and get, and the manager to guess what to chase.
 */
export class MissingHabilitationError extends BusinessError {
  readonly problemType = '/problems/missing-habilitation';

  constructor(day: string, consultantId: string, missionId: string, missing: readonly string[]) {
    super(
      `${consultantId} does not hold ${missing.join(', ')} on ${day}, which mission ${missionId} requires`,
      { day, consultantId, missionId, missing },
    );
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
    recordedQuarterDays: number;
    expectedQuarterDays: number;
  }) {
    super(
      `${input.craId} accounts for ${String(input.recordedQuarterDays)} of ${String(input.expectedQuarterDays)} quarter-days; ${String(input.missingDays.length)} workable days are not accounted for`,
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
    // "answer" rather than "validate": since 21/08/2026 `refuse` is guarded by the same rule, and
    // the message is what a log line shows. The problem type keeps its name — renaming a published
    // identifier is a breaking change for a caller that branches on it (ADR-0016).
    super(`${consultantId} recorded ${craId} and cannot answer it`, { craId, consultantId });
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

/**
 * A persisted `Cra` came back in a state the aggregate's own transitions cannot produce — a
 * `validated` record with nobody who validated it, a `refused` one with no refusal. A **technical**
 * failure and not a business one: no user action produces it, and no retry fixes it. `reconstitute`
 * is the one door into an aggregate that skips the transitions, so it is the one place that has to
 * refuse; without this check "an object must not be able to exist in an invalid state"
 * (`docs/BUILD-RULES.md`) would hold for every caller except the database.
 */
export class InconsistentPersistedCraError extends TechnicalFailure {
  readonly retryable = false;

  constructor(craId: string, detail: string) {
    super(`cra ${craId} was persisted in a state its transitions cannot produce: ${detail}`);
  }
}
