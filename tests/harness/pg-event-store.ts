import { randomUUID } from 'node:crypto';

interface PgClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * The shape `persist` accepts. Matches `DomainEvent` from `@erp/platform` without importing it —
 * the harness carries no workspace dependency, and the fields are the table's columns.
 */
export interface PersistableEvent {
  readonly type: string;
  readonly version: number;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly causationId: string | null;
  readonly payload: unknown;
}

/**
 * Writes a domain event to `domain_events` using the caller's PgClient — which means the event
 * commits or rolls back with the state change it describes (ADR-0020).
 *
 * Lives in `tests/harness/` in Phase 3; promoted to `apps/api/` in Phase 5.
 */
export class PgEventStore {
  readonly #client: PgClient;

  constructor(client: PgClient) {
    this.#client = client;
  }

  async persist(event: PersistableEvent): Promise<string> {
    const id = randomUUID();

    await this.#client.query(
      `INSERT INTO public.domain_events (id, type, version, occurred_at, correlation_id, causation_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        event.type,
        event.version,
        event.occurredAt,
        event.correlationId,
        event.causationId,
        JSON.stringify(event.payload),
      ],
    );

    return id;
  }
}
