interface PgClient {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Allocates the next gapless sequence number for a `(entity, fiscalYear)` series by locking the
 * counter row with `SELECT … FOR UPDATE` (ADR-0007). Must run inside the caller's transaction —
 * using it from a separate connection or outside a transaction defeats the guarantee.
 */
export class PgNumberingCounter {
  readonly #client: PgClient;

  constructor(client: PgClient) {
    this.#client = client;
  }

  async nextSequence(entityId: string, fiscalYear: number): Promise<number> {
    await this.#client.query(
      `INSERT INTO billing.numbering_series (entity_id, fiscal_year, last_sequence)
       VALUES ($1, $2, 0)
       ON CONFLICT DO NOTHING`,
      [entityId, fiscalYear],
    );

    // Read for the lock, not for the value: `FOR UPDATE` is what serialises two concurrent
    // issuances, and the value comes from the UPDATE's RETURNING below.
    await this.#client.query(
      `SELECT last_sequence
       FROM billing.numbering_series
       WHERE entity_id = $1 AND fiscal_year = $2
       FOR UPDATE`,
      [entityId, fiscalYear],
    );

    // The lock is already held by the SELECT above, so reading and writing back would be
    // equivalent — but ADR-0007 step 3 says `last_sequence = last_sequence + 1`, and an ADR the
    // code merely agrees with is one someone will defend out loud and be wrong about.
    const { rows: updated } = await this.#client.query<{ last_sequence: number }>(
      `UPDATE billing.numbering_series
       SET last_sequence = last_sequence + 1
       WHERE entity_id = $1 AND fiscal_year = $2
       RETURNING last_sequence`,
      [entityId, fiscalYear],
    );

    return updated[0]!.last_sequence;
  }
}
