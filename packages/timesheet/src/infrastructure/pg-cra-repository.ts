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
import type { ConsultantId, CraId, MissionId, OfficeId } from '../domain/ids.ts';
import type { CraFlag } from '../domain/submission-checks.ts';

const MAX_PAGE_SIZE = 50;

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

  async findByConsultantAndPeriod(
    consultantId: ConsultantId,
    period: Period,
    actor: Actor,
  ): Promise<Cra | null> {
    const periodIso = `${String(period.year)}-${String(period.month).padStart(2, '0')}`;
    const { rows } = await this.#client.query<CraRow>(
      `SELECT * FROM timesheet.cras WHERE consultant_id = $1 AND period = $2`,
      [consultantId, periodIso],
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
      // neither can widen what the actor may see, only narrow it further (item 7, QA round 1).
      `SELECT c.id, c.consultant_id, c.office_id, c.period, c.status,
              COALESCE(SUM(l.quarter_days), 0)::int AS recorded_quarter_days
       FROM timesheet.cras c
       LEFT JOIN timesheet.cra_lines l ON l.cra_id = c.id
       WHERE c.office_id = $1
         AND ($2::text IS NULL OR c.consultant_id = $2)
         AND ($5::text IS NULL OR c.period = $5)
         AND ($6::text[] IS NULL OR c.consultant_id = ANY($6))
         AND ($7::text[] IS NULL OR c.status = ANY($7))
       GROUP BY c.id, c.consultant_id, c.office_id, c.period, c.status
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
      ],
    );

    return rows.map((row) => ({
      id: row.id,
      consultantId: row.consultant_id,
      officeId: row.office_id,
      period: row.period,
      status: row.status,
      // `::int` in the query rather than a string-to-integer helper here: `SUM` is `bigint` and
      // `pg` hands a `bigint` back as a string, while an `int` arrives as a number. A month of
      // quarter-days cannot approach the 32-bit bound, and `quarterDays` refuses anything that is
      // not a whole non-negative count if the cast ever stops holding.
      recordedQuarterDays: quarterDays(row.recorded_quarter_days),
    }));
  }

  async save(cra: Cra): Promise<void> {
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
        `${String(cra.period.year)}-${String(cra.period.month).padStart(2, '0')}`,
        cra.status,
        cra.submittedAt,
        cra.validatedBy,
        cra.validatedAt,
        cra.refusal?.by ?? null,
        cra.refusal?.at ?? null,
        cra.refusal?.reason ?? null,
      ],
    );

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
