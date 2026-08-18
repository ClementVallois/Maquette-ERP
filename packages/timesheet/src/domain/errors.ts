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
