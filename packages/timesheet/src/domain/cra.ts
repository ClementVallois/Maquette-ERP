import {
  type Clock,
  containsDay,
  QUARTER_DAYS_PER_DAY,
  type IsoDate,
  isoDate,
  type MissionQuarterDays,
  type Period,
  periodToIso,
  type TimesheetValidatedPayload,
} from '@erp/platform';

import { type CraLine, craLine } from './cra-line.ts';
import type { CraStatus } from './cra-status.ts';
import { type RecordedDayType, isBillable } from './day-type.ts';
import {
  CraAfterDepartureError,
  CraTransitionError,
  DayOutsidePeriodError,
  DayOverbookedError,
  NotTheManagerError,
  RefusalReasonRequiredError,
  SelfValidationForbiddenError,
  ValidatedCraIsImmutableError,
  InconsistentPersistedCraError,
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
  readonly quarterDays: number;
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
    /**
     * The consultant's own departure date, `null` for someone still with the firm (ADR-0079).
     * Optional, not defaulted to `null` implicitly: every caller that has a consultant to hand
     * has this value one query away (`public.consultants.departure_date`), and an omitted
     * argument reading as "no departure" would let a caller silently skip the check by forgetting
     * to pass it, rather than by deciding to.
     */
    consultantDeparture: IsoDate | null;
  }): Cra {
    assertNotAfterDeparture(input.period, input.consultantDeparture);

    return new Cra(input.id, input.consultantId, input.officeId, input.period);
  }

  static reconstitute(input: {
    id: CraId;
    consultantId: ConsultantId;
    officeId: OfficeId;
    period: Period;
    status: CraStatus;
    lines: CraLine[];
    flags: CraFlag[];
    submittedAt: Date | null;
    validatedBy: ConsultantId | null;
    validatedAt: Date | null;
    refusal: CraRefusal | null;
  }): Cra {
    assertCraStateIsCoherent(input);

    const cra = new Cra(input.id, input.consultantId, input.officeId, input.period);
    cra.#status = input.status;
    cra.#lines.push(...input.lines);
    cra.#flags = input.flags;
    cra.#submittedAt = input.submittedAt;
    cra.#validatedBy = input.validatedBy;
    cra.#validatedAt = input.validatedAt;
    cra.#refusal = input.refusal;

    return cra;
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

  /** Quarter-days recorded on one day, all missions and absences together. */
  quarterDaysOn(day: IsoDate): number {
    return this.#lines
      .filter((line) => line.day === day)
      .reduce((total, line) => total + line.quarterDays, 0);
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
      quarterDays: input.quarterDays,
    });

    const recorded = this.quarterDaysOn(day) + line.quarterDays;
    if (recorded > QUARTER_DAYS_PER_DAY) {
      throw new DayOverbookedError(day, recorded, QUARTER_DAYS_PER_DAY);
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
      missions: this.#billableQuarterDaysByMission(),
    };
  }

  /** Worked days only, grouped by mission, in a stable order so two runs produce the same event. */
  #billableQuarterDaysByMission(): MissionQuarterDays[] {
    const perMission = new Map<MissionId, number>();

    for (const line of this.#lines) {
      if (!isBillable(line.dayType) || line.missionId === null) continue;
      perMission.set(line.missionId, (perMission.get(line.missionId) ?? 0) + line.quarterDays);
    }

    return [...perMission]
      .map(([missionId, quarterDays]) => ({ missionId, quarterDays }))
      .sort((left, right) => left.missionId.localeCompare(right.missionId));
  }

  /**
   * Sends the record back, with a reason the consultant can act on.
   *
   * It is guarded exactly like `validate`, and the symmetry is the point: refusing a month is an
   * act on someone's record of working time by someone with authority over it, and "who may act"
   * has one answer per Cra (ADR-0006), not one per verb. Until 21/08/2026 this method checked only
   * the status and the reason, so any manager of the office could send back a month they do not
   * manage — the gap surfaced when the screen gained the button.
   */
  refuse(input: { by: ConsultantId; reason: string; clock: Clock; hierarchy: Hierarchy }): void {
    this.#assertNotValidated('refuse');
    if (this.#status !== 'submitted') {
      throw new CraTransitionError(this.#id, this.#status, 'refused');
    }
    if (input.reason.trim() === '') {
      throw new RefusalReasonRequiredError(this.#id);
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

/**
 * ADR-0079: a CRA cannot exist for a period that starts after the consultant left. Checked at
 * `open` only, never at `reconstitute` — a departure erases nothing, so a CRA legitimately opened
 * before someone left stays loadable for as long as its own row exists, and this guard has no
 * opinion on a row it did not create.
 */
function assertNotAfterDeparture(target: Period, departure: IsoDate | null): void {
  if (departure === null) return;

  // The first day of the period — no calendar knowledge needed, every month has a "01".
  const periodStart = `${periodToIso(target)}-01`;
  if (periodStart > departure) {
    throw new CraAfterDepartureError(periodToIso(target), departure);
  }
}

/**
 * The transitions each set a field alongside the status. Reading a row back is the one path that
 * can set the status without them, so it is the one that has to check.
 */
function assertCraStateIsCoherent(input: {
  id: CraId;
  status: CraStatus;
  submittedAt: Date | null;
  validatedBy: ConsultantId | null;
  validatedAt: Date | null;
  refusal: CraRefusal | null;
}): void {
  const refuse = (detail: string): never => {
    throw new InconsistentPersistedCraError(input.id, detail);
  };

  switch (input.status) {
    case 'draft':
      if (input.submittedAt !== null) refuse('a draft carries a submission date');
      if (input.refusal !== null) refuse('a draft carries a refusal');
      break;
    case 'submitted':
      if (input.submittedAt === null) refuse('submitted with no submission date');
      break;
    case 'refused':
      if (input.refusal === null) refuse('refused with no refusal');
      break;
    case 'validated':
      if (input.validatedBy === null) refuse('validated by nobody');
      if (input.validatedAt === null) refuse('validated with no validation date');
      break;
  }

  if (input.status !== 'validated' && (input.validatedBy !== null || input.validatedAt !== null)) {
    refuse(`not validated, yet carrying a validation (status ${input.status})`);
  }
}
