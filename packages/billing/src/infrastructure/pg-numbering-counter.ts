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

    const { rows } = await this.#client.query<{ last_sequence: number }>(
      `SELECT last_sequence
       FROM billing.numbering_series
       WHERE entity_id = $1 AND fiscal_year = $2
       FOR UPDATE`,
      [entityId, fiscalYear],
    );

    const next = rows[0]!.last_sequence + 1;

    await this.#client.query(
      `UPDATE billing.numbering_series
       SET last_sequence = $1
       WHERE entity_id = $2 AND fiscal_year = $3`,
      [next, entityId, fiscalYear],
    );

    return next;
  }
}
