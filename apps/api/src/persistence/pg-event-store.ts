import type { DomainEvent } from '@erp/platform';

import { uuidv7 } from '../ids/uuidv7.ts';

interface PgClient {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * What `persist` accepts. It is `DomainEvent` now that the store lives at the composition root:
 * in `tests/harness/` it was a structural copy, because the harness deliberately carries no
 * workspace dependency and could not import the contract it was writing.
 */
export type PersistableEvent = DomainEvent;

export interface EventStore {
  persist(event: PersistableEvent): Promise<string>;
}

/**
 * Writes a domain event to `domain_events` using the caller's PgClient — which means the event
 * commits or rolls back with the state change it describes (ADR-0020).
 *
 * The event id is a UUIDv7 (`../ids/uuidv7.ts`), injected by the composition root rather than
 * generated here.
 */
export class PgEventStore implements EventStore {
  readonly #client: PgClient;
  readonly #newId: () => string;

  constructor(client: PgClient, newId: () => string = uuidv7) {
    this.#client = client;
    this.#newId = newId;
  }

  async persist(event: PersistableEvent): Promise<string> {
    const id = this.#newId();

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
