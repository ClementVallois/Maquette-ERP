/**
 * The slice of `pg` a read uses. Declared once, so that the generic `query<TRow>` — which the
 * `no-unnecessary-type-parameters` rule reads as an assertion in disguise, and which is genuinely
 * how `pg` is typed — is written in one place rather than in every reader.
 *
 * The same shape is declared inside each module's `infrastructure/` layer for the same reason.
 * They are not shared: a module may not import an app, and a driver-shaped helper has no business
 * on a module's public index.
 */
export interface PgReadClient {
  query<TRow>(text: string, values?: unknown[]): Promise<{ rows: TRow[] }>;
}
