import {
  type Clock,
  containsDay,
  HALF_DAYS_PER_DAY,
  type IsoDate,
  isoDate,
  type Period,
  periodToIso,
} from '@erp/platform';

import { type CraLine, craLine } from './cra-line.ts';
import type { CraStatus } from './cra-status.ts';
import type { RecordedDayType } from './day-type.ts';
import {
  CraTransitionError,
  DayOutsidePeriodError,
  DayOverbookedError,
  RefusalReasonRequiredError,
  ValidatedCraIsImmutableError,
} from './errors.ts';
import type { ConsultantId, CraId, MissionId, OfficeId } from './ids.ts';
import type { TimesheetReference } from './reference.ts';
import { type CraFlag, runSubmissionChecks } from './submission-checks.ts';
import type { WorkingCalendar } from './working-calendar.ts';

export interface CraRefusal {
  readonly by: ConsultantId;
  readonly at: Date;
  readonly reason: string;
}

export interface RecordDayInput {
  readonly day: IsoDate;
  readonly dayType: RecordedDayType;
  readonly missionId?: MissionId | null;
  readonly halfDays: number;
}

/**
 * The monthly record of one consultant's worked days, and the only object in this module that
 * holds state. Its lifecycle and the point at which it stops changing are ADR-0005.
 *
 * Everything a caller can do to it is a named intention — record a day, submit, validate, refuse.
 * There is no setter, and the lines are handed out as a copy: an aggregate that lets a caller push
 * into its own array holds no invariant at all.
 */
export class Cra {
  readonly #id: CraId;
  readonly #consultantId: ConsultantId;
  readonly #officeId: OfficeId;
  readonly #period: Period;
  readonly #lines: CraLine[] = [];

  #status: CraStatus = 'draft';
  #flags: CraFlag[] = [];
  #submittedAt: Date | null = null;
  #validatedBy: ConsultantId | null = null;
  #validatedAt: Date | null = null;
  #refusal: CraRefusal | null = null;

  private constructor(id: CraId, consultantId: ConsultantId, officeId: OfficeId, target: Period) {
    this.#id = id;
    this.#consultantId = consultantId;
    this.#officeId = officeId;
    this.#period = target;
  }

  static open(input: {
    id: CraId;
    consultantId: ConsultantId;
    officeId: OfficeId;
    period: Period;
  }): Cra {
    return new Cra(input.id, input.consultantId, input.officeId, input.period);
  }

  get id(): CraId {
    return this.#id;
  }

  get consultantId(): ConsultantId {
    return this.#consultantId;
  }

  get officeId(): OfficeId {
    return this.#officeId;
  }

  get period(): Period {
    return this.#period;
  }

  get status(): CraStatus {
    return this.#status;
  }

  get lines(): readonly CraLine[] {
    return [...this.#lines];
  }

  /** Days the calendar says are not workable and that carry an entry anyway. Computed at submission. */
  get flags(): readonly CraFlag[] {
    return [...this.#flags];
  }

  get submittedAt(): Date | null {
    return this.#submittedAt;
  }

  get validatedBy(): ConsultantId | null {
    return this.#validatedBy;
  }

  get validatedAt(): Date | null {
    return this.#validatedAt;
  }

  get refusal(): CraRefusal | null {
    return this.#refusal;
  }

  /** Half-days recorded on one day, all missions and absences together. */
  halfDaysOn(day: IsoDate): number {
    return this.#lines
      .filter((line) => line.day === day)
      .reduce((total, line) => total + line.halfDays, 0);
  }

  recordDay(input: RecordDayInput): void {
    this.#assertEditable('record a day');

    const day = isoDate(input.day);
    if (!containsDay(this.#period, day)) {
      throw new DayOutsidePeriodError(day, periodToIso(this.#period));
    }

    const line = craLine({
      day,
      dayType: input.dayType,
      missionId: input.missionId ?? null,
      halfDays: input.halfDays,
    });

    const recorded = this.halfDaysOn(day) + line.halfDays;
    if (recorded > HALF_DAYS_PER_DAY) {
      throw new DayOverbookedError(day, recorded, HALF_DAYS_PER_DAY);
    }

    this.#lines.push(line);
  }

  /** Removes every line of a day. Correcting an entry is remove-then-record, not an edit in place. */
  clearDay(day: IsoDate): void {
    this.#assertEditable('clear a day');

    for (let index = this.#lines.length - 1; index >= 0; index -= 1) {
      if (this.#lines[index]?.day === day) this.#lines.splice(index, 1);
    }
  }

  /**
   * Hands the month to the manager, once it passes the submission checks. The checks are the
   * reason this takes a calendar and a reference snapshot: what may be billed is decided against
   * the working calendar, and a day is only recordable on a mission the consultant was staffed on
   * that day.
   */
  submit(input: { clock: Clock; calendar: WorkingCalendar; reference: TimesheetReference }): void {
    this.#assertNotValidated('submit');
    if (this.#status === 'submitted') {
      throw new CraTransitionError(this.#id, this.#status, 'submitted');
    }

    this.#flags = runSubmissionChecks({
      craId: this.#id,
      consultantId: this.#consultantId,
      period: this.#period,
      lines: this.#lines,
      calendar: input.calendar,
      reference: input.reference,
    });

    this.#status = 'submitted';
    this.#submittedAt = input.clock.now();
    this.#refusal = null;
  }

  /**
   * Accepts the record. This is the transition after which nothing changes — every other method
   * refuses from here on. Who is allowed to call it, and the event it publishes, are added by
   * the validation use case (ADR-0006).
   */
  validate(input: { by: ConsultantId; clock: Clock }): void {
    this.#assertNotValidated('validate');
    if (this.#status !== 'submitted') {
      throw new CraTransitionError(this.#id, this.#status, 'validated');
    }

    this.#status = 'validated';
    this.#validatedBy = input.by;
    this.#validatedAt = input.clock.now();
  }

  refuse(input: { by: ConsultantId; reason: string; clock: Clock }): void {
    this.#assertNotValidated('refuse');
    if (this.#status !== 'submitted') {
      throw new CraTransitionError(this.#id, this.#status, 'refused');
    }
    if (input.reason.trim() === '') {
      throw new RefusalReasonRequiredError(this.#id);
    }

    this.#status = 'refused';
    this.#refusal = { by: input.by, at: input.clock.now(), reason: input.reason };
  }

  #assertEditable(attempted: string): void {
    this.#assertNotValidated(attempted);
    if (this.#status === 'submitted') {
      throw new CraTransitionError(this.#id, this.#status, attempted);
    }
  }

  #assertNotValidated(attempted: string): void {
    if (this.#status === 'validated') {
      throw new ValidatedCraIsImmutableError(this.#id, attempted);
    }
  }
}
