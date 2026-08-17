export interface DomainEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly version: number;
  readonly occurredAt: Date;
  readonly payload: TPayload;
}

export type EventHandler<TEvent extends DomainEvent> = (event: TEvent) => Promise<void>;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
  subscribe<TEvent extends DomainEvent>(type: TEvent['type'], handler: EventHandler<TEvent>): void;
}

export const TIMESHEET_VALIDATED = 'timesheet.TimesheetValidated';

export type TimesheetValidated = DomainEvent<
  typeof TIMESHEET_VALIDATED,
  {
    readonly craId: string;
    readonly consultantId: string;
    readonly missionId: string;
    readonly officeId: string;
    readonly month: string;
    readonly billableDays: number;
    readonly validatedBy: string;
  }
>;
