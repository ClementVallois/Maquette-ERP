import {
  type Actor,
  assertMayRead,
  type QuarterDays,
  type Period,
  quarterDays,
  isoDateOf,
  periodFromIso,
  readScope,
} from '@erp/platform';

import type { CraLine } from '../domain/cra-line.ts';
import type { CraListItem, CraListQuery, CraRepository } from '../domain/cra-repository.ts';
import type { CraStatus } from '../domain/cra-status.ts';
import { Cra, type CraRefusal } from '../domain/cra.ts';
import type { RecordedDayType } from '../domain/day-type.ts';
import { CraAlreadyExistsError } from '../domain/errors.ts';
import type { ConsultantId, CraId, MissionId, OfficeId } from '../domain/ids.ts';
import type { CraFlag } from '../domain/submission-checks.ts';

function periodIsoOf(period: Period): string {
  return `${String(period.year)}-${String(period.month).padStart(2, '0')}`;
}

function isPgUniqueViolation(error: unknown, constraintName: string): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error as { code: unknown }).code === '23505' &&
    'constraint' in error &&
    (error as { constraint: unknown }).constraint === constraintName
  );
}

/**
 * 200, not 50 (ADR-0081) — this repository's own cap, sized past the realistic worst case the
 * seeded roster actually measures (Paris, 65 Cras in one office). Enforced **here**, not only in
 * the route's own `CraListParams`: a route
 * cap the repository's own `Math.min` still narrows behind is not a fix, it is a cap that looks
 * raised and silently isn't. `PgInvoiceRepository`'s own `MAX_PAGE_SIZE` is untouched — a
 * different file, a different constant, deliberately not shared, so this change cannot loosen the
 * invoice list too.
 */
const MAX_PAGE_SIZE = 200;

interface PgClient {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[] }>;
}

export class PgCraRepository implements CraRepository {
  readonly #client: PgClient;
  readonly #newId: () => string;

  /**
   * `newId` is injected rather than imported: ADR-0041 puts the UUIDv7 generator in the
   * composition root, and the dependency rule grants this module `@erp/platform` and nothing
   * else. It mints child-row ids — the positional `${cra.id}-line-${index}` strings it replaces
   * were not UUIDs at all.
   */
  constructor(client: PgClient, newId: () => string) {
    this.#client = client;
    this.#newId = newId;
  }

  async findById(id: CraId, actor: Actor): Promise<Cra | null> {
    const { rows } = await this.#client.query<CraRow>(
      `SELECT * FROM timesheet.cras WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) return null;
    const row = rows[0]!;
    assertMayRead(actor, 'cra', { officeId: row.office_id, subjectId: row.consultant_id });

    return this.#reconstitute(row);
  }

  async findListItemsByIds(ids: readonly CraId[], actor: Actor): Promise<readonly CraListItem[]> {
    if (ids.length === 0) return [];
    const scope = readScope(actor, 'cra');
    if (scope === 'none') return [];

    const { rows } = await this.#client.query<CraListRow>(
      `${CRA_LIST_SELECT}
       WHERE c.office_id = $1
         AND ($2::text IS NULL OR c.consultant_id = $2)
         AND c.id = ANY($3::text[])
       GROUP BY c.id, c.consultant_id, c.office_id, c.period, c.status,
                c.validated_at, c.refusal_at, c.submitted_at
       ORDER BY c.period DESC, c.consultant_id`,
      [actor.officeId, scope === 'own' ? actor.consultantId : null, ids],
    );

    return rows.map(toCraListItem);
  }

  async listPeriod(actor: Actor, period: string): Promise<readonly CraListItem[]> {
    const scope = readScope(actor, 'cra');
    if (scope === 'none') return [];

    const { rows } = await this.#client.query<CraListRow>(
      `${CRA_LIST_SELECT}
       WHERE c.office_id = $1
         AND ($2::text IS NULL OR c.consultant_id = $2)
         AND c.period = $3
       GROUP BY c.id, c.consultant_id, c.office_id, c.period, c.status,
                c.validated_at, c.refusal_at, c.submitted_at
       ORDER BY c.period DESC, c.consultant_id`,
      [actor.officeId, scope === 'own' ? actor.consultantId : null, period],
    );

    return rows.map(toCraListItem);
  }

  async findByConsultantAndPeriod(
    consultantId: ConsultantId,
    period: Period,
    actor: Actor,
  ): Promise<Cra | null> {
    const { rows } = await this.#client.query<CraRow>(
      `SELECT * FROM timesheet.cras WHERE consultant_id = $1 AND period = $2`,
      [consultantId, periodIsoOf(period)],
    );

    if (rows.length === 0) return null;
    const row = rows[0]!;
    assertMayRead(actor, 'cra', { officeId: row.office_id, subjectId: row.consultant_id });

    return this.#reconstitute(row);
  }

  async findByIdForWrite(id: CraId, actor: Actor): Promise<Cra | null> {
    const { rows } = await this.#client.query<CraRow>(
      `SELECT * FROM timesheet.cras WHERE id = $1 FOR UPDATE`,
      [id],
    );

    if (rows.length === 0) return null;
    const row = rows[0]!;
    assertMayRead(actor, 'cra', { officeId: row.office_id, subjectId: row.consultant_id });

    return this.#reconstitute(row);
  }

  async findByConsultantAndPeriodForWrite(
    consultantId: ConsultantId,
    period: Period,
    actor: Actor,
  ): Promise<Cra | null> {
    // A row lock alone cannot protect a Cra that does not exist yet (ADR-0103): the advisory lock
    // is keyed on the pair a not-yet-existing row has no id for, and it is what a concurrent
    // `recordMonth` for the same consultant/period contends on while this one decides whether to
    // create or edit.
    await this.#client.query(
      `SELECT pg_advisory_xact_lock(hashtext('timesheet.cra.write'), hashtext($1))`,
      [`${consultantId}:${periodIsoOf(period)}`],
    );

    const { rows } = await this.#client.query<CraRow>(
      `SELECT * FROM timesheet.cras WHERE consultant_id = $1 AND period = $2 FOR UPDATE`,
      [consultantId, periodIsoOf(period)],
    );

    if (rows.length === 0) return null;
    const row = rows[0]!;
    assertMayRead(actor, 'cra', { officeId: row.office_id, subjectId: row.consultant_id });

    return this.#reconstitute(row);
  }

  /**
   * A list is filtered, never refused: an empty page is the honest answer to "show me what I may
   * see", and it is the FIRST of ADR-0003's two beats. The second — a typed refusal on a direct
   * read of a record that exists — is `findById` above.
   */
  async list(query: CraListQuery): Promise<readonly CraListItem[]> {
    const limit = Math.min(query.limit, MAX_PAGE_SIZE);
    const { actor } = query;
    const scope = readScope(actor, 'cra');

    if (scope === 'none') return [];

    const { rows } = await this.#client.query<CraListRow>(
      // LEFT JOIN, and the `COALESCE` with it: a month opened and never filled is precisely the
      // row the pré-facturier exists to show, and an inner join would drop it.
      //
      // `c.office_id = $1` (and, for a consultant, `$2`) runs first and unconditionally — `$6`
      // (consultantIds) and `$7` (statuses) are ANDed onto it, never substituted for it, so
      // neither can widen what the actor may see, only narrow it further.
      `${CRA_LIST_SELECT}
       WHERE c.office_id = $1
         AND ($2::text IS NULL OR c.consultant_id = $2)
         AND ($5::text IS NULL OR c.period = $5)
         AND ($6::text[] IS NULL OR c.consultant_id = ANY($6))
         AND ($7::text[] IS NULL OR c.status = ANY($7))
         AND ($8::text IS NULL OR left(c.period, 4) = $8)
         AND ($9::text IS NULL OR right(c.period, 2) = $9)
         AND ($10::text IS NULL OR c.period < $10)
       GROUP BY c.id, c.consultant_id, c.office_id, c.period, c.status,
                c.validated_at, c.refusal_at, c.submitted_at
       ORDER BY c.period DESC, c.consultant_id
       LIMIT $3 OFFSET $4`,
      [
        actor.officeId,
        scope === 'own' ? actor.consultantId : null,
        limit,
        query.offset,
        query.period ?? null,
        query.consultantIds !== undefined && query.consultantIds.length > 0
          ? query.consultantIds
          : null,
        query.statuses !== undefined && query.statuses.length > 0 ? query.statuses : null,
        // `period` is `YYYY-MM` text (migration 002's own comment) — `left`/`right` on that
        // string is what the year-alone/month-alone filtering needs, cheaper than a real date
        // type this column was never given. Zero-padded to two digits: `period`
        // itself always is, and an unpadded '6' would never match `right(c.period, 2)`'s '06'.
        query.year === undefined ? null : String(query.year),
        query.month === undefined ? null : String(query.month).padStart(2, '0'),
        // Plain text comparison — `period` sorts lexically the same as
        // chronologically for `YYYY-MM` text, same reasoning `routes/_shell/pre-facturier.tsx`'s
        // own `localeCompare` on this column already relies on.
        query.beforePeriod ?? null,
      ],
    );

    return rows.map(toCraListItem);
  }

  /** Rank A12: `list`'s own `WHERE`, minus the join/aggregation a count does not need. */
  async count(query: Omit<CraListQuery, 'limit' | 'offset'>): Promise<number> {
    const { actor } = query;
    const scope = readScope(actor, 'cra');

    if (scope === 'none') return 0;

    const { rows } = await this.#client.query<{ count: string }>(
      `SELECT COUNT(*) AS count
       FROM timesheet.cras c
       WHERE c.office_id = $1
         AND ($2::text IS NULL OR c.consultant_id = $2)
         AND ($3::text IS NULL OR c.period = $3)
         AND ($4::text[] IS NULL OR c.consultant_id = ANY($4))
         AND ($5::text[] IS NULL OR c.status = ANY($5))
         AND ($6::text IS NULL OR left(c.period, 4) = $6)
         AND ($7::text IS NULL OR right(c.period, 2) = $7)
         AND ($8::text IS NULL OR c.period < $8)`,
      [
        actor.officeId,
        scope === 'own' ? actor.consultantId : null,
        query.period ?? null,
        query.consultantIds !== undefined && query.consultantIds.length > 0
          ? query.consultantIds
          : null,
        query.statuses !== undefined && query.statuses.length > 0 ? query.statuses : null,
        query.year === undefined ? null : String(query.year),
        query.month === undefined ? null : String(query.month).padStart(2, '0'),
        query.beforePeriod ?? null,
      ],
    );

    // `COUNT(*)` is `bigint`, and `pg` hands that back as a string — an office's Cra count cannot
    // approach the 32-bit bound, so a plain parse is safe (same reasoning `recordedQuarterDays`'s
    // own comment gives for its `::int` cast, without the cast: `COUNT` has no `::int` overload).
    return Number.parseInt(rows[0]!.count, 10);
  }

  async listPeriods(actor: Actor): Promise<readonly string[]> {
    const scope = readScope(actor, 'cra');
    if (scope === 'none') return [];

    const { rows } = await this.#client.query<{ period: string }>(
      `SELECT DISTINCT c.period
       FROM timesheet.cras c
       WHERE c.office_id = $1
         AND ($2::text IS NULL OR c.consultant_id = $2)
       ORDER BY c.period DESC`,
      [actor.officeId, scope === 'own' ? actor.consultantId : null],
    );

    return rows.map((row) => row.period);
  }

  /**
   * The consultant's own distinct refused periods, never derived from a page —
   * `listPeriods`'s own reasoning, narrowed to one consultant and one status. `own` scope
   * requires `consultantId` to be the actor's own; a manager or billing actor asking about
   * someone else answers an empty result rather than raising, the same "filtered, not refused"
   * shape `list` already gives for a query that reaches outside what the actor may see.
   */
  async refusedPeriods(consultantId: ConsultantId, actor: Actor): Promise<readonly string[]> {
    const scope = readScope(actor, 'cra');
    if (scope === 'none') return [];
    if (scope === 'own' && consultantId !== actor.consultantId) return [];

    const { rows } = await this.#client.query<{ period: string }>(
      `SELECT DISTINCT c.period
       FROM timesheet.cras c
       WHERE c.office_id = $1 AND c.consultant_id = $2 AND c.status = 'refused'
       ORDER BY c.period DESC`,
      [actor.officeId, consultantId],
    );

    return rows.map((row) => row.period);
  }

  /**
   * The dashboard's "recent activity" feed, sorted and limited in SQL rather than sliced from
   * `list`'s own page, which would only ever see the rows that page happened to hold.
   */
  async recentActivity(actor: Actor, limit: number): Promise<readonly CraListItem[]> {
    const scope = readScope(actor, 'cra');
    if (scope === 'none') return [];

    const { rows } = await this.#client.query<CraListRow>(
      `SELECT c.id, c.consultant_id, c.office_id, c.period, c.status,
              COALESCE(SUM(l.quarter_days), 0)::int AS recorded_quarter_days,
              COALESCE(c.validated_at, c.refusal_at, c.submitted_at) AS status_changed_at
       FROM timesheet.cras c
       LEFT JOIN timesheet.cra_lines l ON l.cra_id = c.id
       WHERE c.office_id = $1
         AND ($2::text IS NULL OR c.consultant_id = $2)
         AND COALESCE(c.validated_at, c.refusal_at, c.submitted_at) IS NOT NULL
       GROUP BY c.id, c.consultant_id, c.office_id, c.period, c.status,
                c.validated_at, c.refusal_at, c.submitted_at
       ORDER BY status_changed_at DESC
       LIMIT $3`,
      [actor.officeId, scope === 'own' ? actor.consultantId : null, limit],
    );

    return rows.map(toCraListItem);
  }

  /**
   * The manager's "awaiting a decision" queue, oldest first, sorted and limited in SQL — the
   * same reasoning as `recentActivity`, over the whole office rather than one page of it.
   */
  async awaitingDecision(actor: Actor, limit: number): Promise<readonly CraListItem[]> {
    const scope = readScope(actor, 'cra');
    if (scope === 'none') return [];

    const { rows } = await this.#client.query<CraListRow>(
      `SELECT c.id, c.consultant_id, c.office_id, c.period, c.status,
              COALESCE(SUM(l.quarter_days), 0)::int AS recorded_quarter_days,
              COALESCE(c.validated_at, c.refusal_at, c.submitted_at) AS status_changed_at
       FROM timesheet.cras c
       LEFT JOIN timesheet.cra_lines l ON l.cra_id = c.id
       WHERE c.office_id = $1
         AND ($2::text IS NULL OR c.consultant_id = $2)
         AND c.status = 'submitted'
       GROUP BY c.id, c.consultant_id, c.office_id, c.period, c.status,
                c.validated_at, c.refusal_at, c.submitted_at
       ORDER BY status_changed_at ASC
       LIMIT $3`,
      [actor.officeId, scope === 'own' ? actor.consultantId : null, limit],
    );

    return rows.map(toCraListItem);
  }

  async save(cra: Cra): Promise<void> {
    try {
      await this.#client.query(
        `INSERT INTO timesheet.cras (
          id, consultant_id, office_id, period, status,
          submitted_at, validated_by, validated_at,
          refusal_by, refusal_at, refusal_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          submitted_at = EXCLUDED.submitted_at,
          validated_by = EXCLUDED.validated_by,
          validated_at = EXCLUDED.validated_at,
          refusal_by = EXCLUDED.refusal_by,
          refusal_at = EXCLUDED.refusal_at,
          refusal_reason = EXCLUDED.refusal_reason`,
        [
          cra.id,
          cra.consultantId,
          cra.officeId,
          periodIsoOf(cra.period),
          cra.status,
          cra.submittedAt,
          cra.validatedBy,
          cra.validatedAt,
          cra.refusal?.by ?? null,
          cra.refusal?.at ?? null,
          cra.refusal?.reason ?? null,
        ],
      );
    } catch (error: unknown) {
      // The second boundary (ADR-0103): unreachable through `findByConsultantAndPeriodForWrite`'s
      // advisory lock in the ordinary path, and here so a caller that bypasses it gets a typed
      // conflict instead of a raw `23505` — the same idiom `saveDraft` uses in `billing`.
      if (isPgUniqueViolation(error, 'cras_consultant_id_period_key')) {
        throw new CraAlreadyExistsError(cra.consultantId, periodIsoOf(cra.period));
      }
      throw error;
    }

    await this.#client.query(`DELETE FROM timesheet.cra_lines WHERE cra_id = $1`, [cra.id]);
    await this.#client.query(`DELETE FROM timesheet.cra_flags WHERE cra_id = $1`, [cra.id]);

    for (const line of cra.lines) {
      await this.#client.query(
        `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, quarter_days)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [this.#newId(), cra.id, line.day, line.dayType, line.missionId, line.quarterDays],
      );
    }

    for (const flag of cra.flags) {
      await this.#client.query(
        `INSERT INTO timesheet.cra_flags (id, cra_id, day, reason)
         VALUES ($1, $2, $3, $4)`,
        [this.#newId(), cra.id, flag.day, flag.reason],
      );
    }
  }

  async #reconstitute(row: CraRow): Promise<Cra> {
    const { rows: lineRows } = await this.#client.query<CraLineRow>(
      `SELECT day, day_type, mission_id, quarter_days FROM timesheet.cra_lines WHERE cra_id = $1 ORDER BY day, mission_id`,
      [row.id],
    );

    const { rows: flagRows } = await this.#client.query<CraFlagRow>(
      `SELECT day, reason FROM timesheet.cra_flags WHERE cra_id = $1 ORDER BY day`,
      [row.id],
    );

    const lines: CraLine[] = lineRows.map((lineRow) => ({
      day: isoDateOf(lineRow.day),
      dayType: lineRow.day_type as RecordedDayType,
      missionId: (lineRow.mission_id ?? null) as MissionId | null,
      quarterDays: quarterDays(lineRow.quarter_days) as QuarterDays,
    }));

    const flags: CraFlag[] = flagRows.map((flagRow) => ({
      day: isoDateOf(flagRow.day),
      reason: flagRow.reason as 'weekend' | 'publicHoliday',
    }));

    const refusal: CraRefusal | null =
      row.refusal_by !== null && row.refusal_at !== null && row.refusal_reason !== null
        ? { by: row.refusal_by as ConsultantId, at: row.refusal_at, reason: row.refusal_reason }
        : null;

    return Cra.reconstitute({
      id: row.id as CraId,
      consultantId: row.consultant_id as ConsultantId,
      officeId: row.office_id as OfficeId,
      period: periodFromIso(row.period) as Period,
      status: row.status as CraStatus,
      lines,
      flags,
      submittedAt: row.submitted_at,
      validatedBy: (row.validated_by ?? null) as ConsultantId | null,
      validatedAt: row.validated_at,
      refusal,
    });
  }
}

interface CraRow {
  id: string;
  consultant_id: string;
  office_id: string;
  period: string;
  status: string;
  submitted_at: Date | null;
  validated_by: string | null;
  validated_at: Date | null;
  refusal_by: string | null;
  refusal_at: Date | null;
  refusal_reason: string | null;
}

interface CraListRow {
  id: string;
  consultant_id: string;
  office_id: string;
  period: string;
  status: string;
  recorded_quarter_days: number;
  status_changed_at: Date | null;
}

const CRA_LIST_SELECT = `
  SELECT c.id, c.consultant_id, c.office_id, c.period, c.status,
         COALESCE(SUM(l.quarter_days), 0)::int AS recorded_quarter_days,
         COALESCE(c.validated_at, c.refusal_at, c.submitted_at) AS status_changed_at
  FROM timesheet.cras c
  LEFT JOIN timesheet.cra_lines l ON l.cra_id = c.id
`;

/** Shared by `list`, `recentActivity` and `awaitingDecision`: one row shape, one mapping. */
function toCraListItem(row: CraListRow): CraListItem {
  return {
    id: row.id,
    consultantId: row.consultant_id,
    officeId: row.office_id,
    period: row.period,
    // The `crm.status` column carries a `CHECK (status IN (...))` matching `CraStatus` exactly
    // (migration 002) — `pg` still hands every column back as `string`, so this is the one place
    // that narrows it back to the domain's own union. Narrowing here rather than in
    // `CraListItem.status` is what keeps every reader from re-deriving the same cast.
    status: row.status as CraStatus,
    // `::int` in the query rather than a string-to-integer helper here: `SUM` is `bigint` and
    // `pg` hands a `bigint` back as a string, while an `int` arrives as a number. A month of
    // quarter-days cannot approach the 32-bit bound, and `quarterDays` refuses anything that is
    // not a whole non-negative count if the cast ever stops holding.
    recordedQuarterDays: quarterDays(row.recorded_quarter_days),
    statusChangedAt: row.status_changed_at === null ? null : row.status_changed_at.toISOString(),
  };
}

interface CraLineRow {
  day: Date | string;
  day_type: string;
  mission_id: string | null;
  quarter_days: number;
}

interface CraFlagRow {
  day: Date | string;
  reason: string;
}
