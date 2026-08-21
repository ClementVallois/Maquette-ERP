import { lineAmountCents } from '@erp/billing';
import { type Actor, assertMayRead, lastDayOf, type Period } from '@erp/platform';
import type { CraRepository } from '@erp/timesheet';

import { ApiFailure } from '../errors.ts';
import { exactCents } from '../persistence/columns.ts';
import type { PgReadClient } from '../persistence/pg-client.ts';

/**
 * The progressive-disclosure control of BUILD-PLAN 5.3: `Tjm`, `Cjm` and margin are served **only**
 * here, by a dedicated single-record read, and every access is logged.
 *
 * The control is the extra request, not the secrecy. `Cjm`, `Tjm` and margin are already absent
 * from every list projection (ADR-0003) — the asset being protected is the aggregate, so what has
 * to be expensive is collecting eight hundred of them, not reading one. One round trip per
 * consultant is half a second for a legitimate reveal and prohibitive for a scrape, and the log
 * line is what makes the scrape attributable afterwards.
 *
 * Why it lives at the composition root and in neither module (ADR-0043): margin has two terms and
 * they belong to different owners. `Tjm` is a commercial term of a mission, which is `billing`'s
 * projection; `Cjm` is what a consultant costs the firm, which is neither module's rule — no
 * invariant anywhere reads it. Putting the join in `billing` would make it responsible for a cost
 * it never bills on; putting it in `timesheet` would give the module that records days a reason to
 * know what they are sold for. The days themselves come through `CraRepository`, so `timesheet`
 * still answers the only question that is its own: who worked how much, on what.
 */

export interface MissionEconomics {
  readonly missionId: string;
  readonly missionName: string;
  readonly halfDays: number;
  readonly tjmCents: number;
  readonly revenueCents: number;
  readonly costCents: number;
  readonly marginCents: number;
}

export interface ConsultantEconomics {
  readonly consultantId: string;
  readonly displayName: string;
  readonly period: string;
  readonly cjmCents: number;
  readonly missions: readonly MissionEconomics[];
  readonly revenueCents: number;
  readonly costCents: number;
  readonly marginCents: number;
}

interface ConsultantRow {
  first_name: string;
  last_name: string;
  office_id: string;
}

interface CjmRow {
  cjm_cents: string | number;
}

interface TjmRow {
  mission_id: string;
  mission_name: string;
  tjm_cents: string | number;
}

export interface EconomicsDependencies {
  readonly client: PgReadClient;
  readonly cras: CraRepository;
}

/**
 * Returns `null` when the consultant has no Cra for the period — an empty state, not a refusal.
 * A refusal is `OutOfScopeError`, raised by `assertMayRead` before anything sensitive is read.
 */
export async function consultantEconomics(
  dependencies: EconomicsDependencies,
  input: { consultantId: string; period: Period; actor: Actor },
): Promise<ConsultantEconomics | null> {
  const { rows: consultants } = await dependencies.client.query<ConsultantRow>(
    `SELECT first_name, last_name, office_id FROM public.consultants WHERE id = $1`,
    [input.consultantId],
  );
  const consultant = consultants[0];
  if (consultant === undefined) return null;

  // Before any rate is read. `economics` is `office` for a manager and `none` for the other two,
  // so a billing persona is refused here even for its own office (ADR-0023).
  assertMayRead(input.actor, 'economics', {
    officeId: consultant.office_id,
    subjectId: input.consultantId,
  });

  const cra = await dependencies.cras.findByConsultantAndPeriod(
    input.consultantId,
    input.period,
    input.actor,
  );
  if (cra === null) return null;

  // The close of the period, which is the date both dated references resolve at (ADR-0034).
  const on = lastDayOf(input.period);

  const { rows: cjmRows } = await dependencies.client.query<CjmRow>(
    `SELECT cjm_cents FROM public.consultant_grades
     WHERE consultant_id = $1 AND from_date <= $2 AND (to_date IS NULL OR to_date >= $2)
     ORDER BY from_date DESC LIMIT 1`,
    [input.consultantId, on],
  );
  const cjmRow = cjmRows[0];
  if (cjmRow === undefined) {
    throw new ApiFailure(`no Cjm in force for ${input.consultantId} on ${on}`);
  }
  const cjmCents = exactCents('cjm_cents', cjmRow.cjm_cents);

  const halfDaysByMission = new Map<string, number>();
  for (const line of cra.lines) {
    if (line.dayType !== 'worked' || line.missionId === null) continue;
    halfDaysByMission.set(
      line.missionId,
      (halfDaysByMission.get(line.missionId) ?? 0) + line.halfDays,
    );
  }

  const { rows: tjmRows } = await dependencies.client.query<TjmRow>(
    `SELECT t.mission_id, m.name AS mission_name, t.tjm_cents
     FROM public.mission_tjm t
     JOIN public.missions m ON m.id = t.mission_id
     WHERE t.from_date <= $1 AND (t.to_date IS NULL OR t.to_date >= $1)`,
    [on],
  );
  const rates = new Map(tjmRows.map((row) => [row.mission_id, row]));

  const missions: MissionEconomics[] = [];
  for (const [missionId, halfDays] of [...halfDaysByMission].sort()) {
    const rate = rates.get(missionId);
    // A Forfait mission has no dated Tjm. It is skipped rather than counted at zero, which would
    // report a loss equal to its cost on a mission that is not sold by the day.
    if (rate === undefined) continue;

    const tjmCents = exactCents('tjm_cents', rate.tjm_cents);
    // Through `billing`'s helper, which is the single call site allowed to divide and the one
    // that asserts its precondition (BUILD-RULES § Money). The API does no money arithmetic of
    // its own beyond adding these integers together.
    const revenueCents = lineAmountCents(halfDays, tjmCents);
    const costCents = lineAmountCents(halfDays, cjmCents);

    missions.push({
      missionId,
      missionName: rate.mission_name,
      halfDays,
      tjmCents,
      revenueCents,
      costCents,
      marginCents: revenueCents - costCents,
    });
  }

  const revenueCents = missions.reduce((total, mission) => total + mission.revenueCents, 0);
  const costCents = missions.reduce((total, mission) => total + mission.costCents, 0);

  return {
    consultantId: input.consultantId,
    displayName: `${consultant.first_name} ${consultant.last_name}`,
    period: `${String(input.period.year)}-${String(input.period.month).padStart(2, '0')}`,
    cjmCents,
    missions,
    revenueCents,
    costCents,
    marginCents: revenueCents - costCents,
  };
}
