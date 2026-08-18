import {
  type HalfDays,
  type IsoDate,
  type Period,
  halfDays,
  isoDate,
  periodFromIso,
} from '@erp/platform';
// eslint-disable-next-line import-x/no-extraneous-dependencies -- pg is in dependencies; @types/pg is a devDependency because types are compile-time
import pg from 'pg';

// Tell pg to return DATE columns as strings, not Date objects. pg's default parser applies the
// local timezone, which shifts the date by one day when the machine is not UTC — a worked day
// is a date (BUILD-RULES), and a date must survive a round trip without shifting.
pg.types.setTypeParser(1082, (val: string) => val);

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

  constructor(client: PgClient) {
    this.#client = client;
  }

  async findById(id: CraId, actor: { officeId: OfficeId }): Promise<Cra | null> {
    const { rows } = await this.#client.query<CraRow>(
      `SELECT * FROM timesheet.cras WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) return null;
    const row = rows[0]!;
    if (row.office_id !== actor.officeId) return null;

    return this.#reconstitute(row);
  }

  async findByConsultantAndPeriod(
    consultantId: ConsultantId,
    period: Period,
    actor: { officeId: OfficeId },
  ): Promise<Cra | null> {
    const periodIso = `${String(period.year)}-${String(period.month).padStart(2, '0')}`;
    const { rows } = await this.#client.query<CraRow>(
      `SELECT * FROM timesheet.cras WHERE consultant_id = $1 AND period = $2`,
      [consultantId, periodIso],
    );

    if (rows.length === 0) return null;
    const row = rows[0]!;
    if (row.office_id !== actor.officeId) return null;

    return this.#reconstitute(row);
  }

  async list(query: CraListQuery): Promise<readonly CraListItem[]> {
    const limit = Math.min(query.limit, MAX_PAGE_SIZE);

    const { rows } = await this.#client.query<CraListRow>(
      `SELECT id, consultant_id, office_id, period, status
       FROM timesheet.cras
       WHERE office_id = $1
       ORDER BY period DESC, consultant_id
       LIMIT $2 OFFSET $3`,
      [query.officeId, limit, query.offset],
    );

    return rows.map((row) => ({
      id: row.id,
      consultantId: row.consultant_id,
      officeId: row.office_id,
      period: row.period,
      status: row.status,
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

    for (const [index, line] of cra.lines.entries()) {
      await this.#client.query(
        `INSERT INTO timesheet.cra_lines (id, cra_id, day, day_type, mission_id, half_days)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `${cra.id}-line-${String(index)}`,
          cra.id,
          line.day,
          line.dayType,
          line.missionId,
          line.halfDays,
        ],
      );
    }

    for (const [index, flag] of cra.flags.entries()) {
      await this.#client.query(
        `INSERT INTO timesheet.cra_flags (id, cra_id, day, reason)
         VALUES ($1, $2, $3, $4)`,
        [`${cra.id}-flag-${String(index)}`, cra.id, flag.day, flag.reason],
      );
    }
  }

  async #reconstitute(row: CraRow): Promise<Cra> {
    const { rows: lineRows } = await this.#client.query<CraLineRow>(
      `SELECT day, day_type, mission_id, half_days FROM timesheet.cra_lines WHERE cra_id = $1 ORDER BY day, mission_id`,
      [row.id],
    );

    const { rows: flagRows } = await this.#client.query<CraFlagRow>(
      `SELECT day, reason FROM timesheet.cra_flags WHERE cra_id = $1 ORDER BY day`,
      [row.id],
    );

    const lines: CraLine[] = lineRows.map((lineRow) => ({
      day: isoDate(toDateString(lineRow.day)) as IsoDate,
      dayType: lineRow.day_type as RecordedDayType,
      missionId: (lineRow.mission_id ?? null) as MissionId | null,
      halfDays: halfDays(lineRow.half_days) as HalfDays,
    }));

    const flags: CraFlag[] = flagRows.map((flagRow) => ({
      day: isoDate(toDateString(flagRow.day)) as IsoDate,
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

function toDateString(pgDate: Date | string): string {
  if (typeof pgDate === 'string') return pgDate;
  // pg returns DATE columns as Date objects at midnight UTC. Using toISOString() is correct
  // because the container and connection are both UTC.
  const year = pgDate.getUTCFullYear();
  const month = String(pgDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(pgDate.getUTCDate()).padStart(2, '0');
  return `${String(year)}-${month}-${day}`;
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
}

interface CraLineRow {
  day: Date | string;
  day_type: string;
  mission_id: string | null;
  half_days: number;
}

interface CraFlagRow {
  day: Date | string;
  reason: string;
}
