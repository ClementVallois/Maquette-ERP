/**
 * A fact that has already happened, published in-process (ADR-0001). The emitter does not know
 * who listens, and a subscriber runs inside the emitter's transaction — which is why a subscriber
 * performs no I/O. The day one does, an outbox is required; that is the threshold, not a detail.
 */
export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly version: number;
  readonly occurredAt: Date;
  /**
   * The whole chain of work one human action set off — a validation, the invoice it drafted, the
   * lines it wrote. Every event of that chain carries the same value, which is what makes a log
   * readable after the fact.
   */
  readonly correlationId: string;
  /** The event this one is a consequence of, or `null` when a human started the chain. */
  readonly causationId: string | null;
  readonly payload: TPayload;
}

export type EventHandler<TEvent extends DomainEvent> = (event: TEvent) => Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<TEvent extends DomainEvent>(type: TEvent['type'], handler: EventHandler<TEvent>): void;
}

export const TIMESHEET_VALIDATED = 'timesheet.TimesheetValidated';

/**
 * What one validated Cra is worth per mission. A Cra spans a month, and a month spans several
 * missions, so the payload is a breakdown and not a single mission — a validated Cra with two
 * missions produces two invoice lines, and a single `missionId` would have silently billed one.
 *
 * Quantities are counts of **half-days** (ADR-0012): the unit that is recorded is the unit that is
 * transported and the unit that is billed, with no conversion anywhere on the way.
 */
export interface MissionHalfDays {
  readonly missionId: string;
  readonly halfDays: number;
}

export interface TimesheetValidatedPayload {
  readonly craId: string;
  readonly consultantId: string;
  readonly officeId: string;
  /** The month the Cra covers, `YYYY-MM`. */
  readonly period: string;
  readonly validatedBy: string;
  /** Worked days only, grouped by mission. An absence is not billable and is not here. */
  readonly missions: readonly MissionHalfDays[];
}

export type TimesheetValidated = DomainEvent<typeof TIMESHEET_VALIDATED, TimesheetValidatedPayload>;

export const TIMESHEET_VALIDATED_VERSION = 1;
