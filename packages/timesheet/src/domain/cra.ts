import {
  type Clock,
  containsDay,
  HALF_DAYS_PER_DAY,
  type IsoDate,
  isoDate,
  type MissionHalfDays,
  type Period,
  periodToIso,
  type TimesheetValidatedPayload,
} from '@erp/platform';

import { type CraLine, craLine } from './cra-line.ts';
import type { CraStatus } from './cra-status.ts';
import { type RecordedDayType, isBillable } from './day-type.ts';
import {
  CraTransitionError,
  DayOutsidePeriodError,
  DayOverbookedError,
  NotTheManagerError,
  RefusalReasonRequiredError,
  SelfValidationForbiddenError,
  ValidatedCraIsImmutableError,
} from './errors.ts';
import type { Hierarchy } from './hierarchy.ts';
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
   * Accepts the record, and returns what the month is worth per mission. This is the transition
   * after which nothing changes — every other method refuses from here on.
   *
   * Returning the payload rather than publishing it keeps the domain free of the bus: the
   * aggregate states the fact, the use case is what tells anyone about it.
   */
  validate(input: {
    by: ConsultantId;
    clock: Clock;
    hierarchy: Hierarchy;
  }): TimesheetValidatedPayload {
    this.#assertNotValidated('validate');
    if (this.#status !== 'submitted') {
      throw new CraTransitionError(this.#id, this.#status, 'validated');
    }
    if (input.by === this.#consultantId) {
      throw new SelfValidationForbiddenError(this.#id, this.#consultantId);
    }

    const manager = input.hierarchy.managerOf(this.#consultantId, this.#period);
    if (input.by !== manager) {
      throw new NotTheManagerError({
        craId: this.#id,
        consultantId: this.#consultantId,
        period: periodToIso(this.#period),
        attempted: input.by,
        manager,
      });
    }

    this.#status = 'validated';
    this.#validatedBy = input.by;
    this.#validatedAt = input.clock.now();

    return {
      craId: this.#id,
      consultantId: this.#consultantId,
      officeId: this.#officeId,
      period: periodToIso(this.#period),
      validatedBy: input.by,
      missions: this.#billableHalfDaysByMission(),
    };
  }

  /** Worked days only, grouped by mission, in a stable order so two runs produce the same event. */
  #billableHalfDaysByMission(): MissionHalfDays[] {
    const perMission = new Map<MissionId, number>();

    for (const line of this.#lines) {
      if (!isBillable(line.dayType) || line.missionId === null) continue;
      perMission.set(line.missionId, (perMission.get(line.missionId) ?? 0) + line.halfDays);
    }

    return [...perMission]
      .map(([missionId, halfDays]) => ({ missionId, halfDays }))
      .sort((left, right) => left.missionId.localeCompare(right.missionId));
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
