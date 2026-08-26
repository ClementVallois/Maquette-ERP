import { lineAmountCents } from '@erp/billing';
import { type Actor, assertMayRead, lastDayOf, type Period, periodToIso } from '@erp/platform';
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
  readonly quarterDays: number;
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

/**
 * The one method of pino's logger this module uses. A structural narrowing of a third-party type,
 * not a port (BUILD-RULES § Boundary and layering) — there is one implementation and no test
 * injects a second to prove anything a real logger could not.
 */
export interface DisclosureLog {
  info(payload: object, message: string): void;
}

export interface EconomicsDependencies {
  readonly client: PgReadClient;
  readonly cras: CraRepository;
  /** The request's logger, so the disclosure line carries the request's `correlationId`. */
  readonly log: DisclosureLog;
}

/** The fields this read discloses, named once. Names only — never their values (ADR-0024). */
const DISCLOSED_FIELDS = ['cjmCents', 'tjmCents', 'marginCents'] as const;

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
  const periodIso = periodToIso(input.period);

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

  const quarterDaysByMission = new Map<string, number>();
  for (const line of cra.lines) {
    if (line.dayType !== 'worked' || line.missionId === null) continue;
    quarterDaysByMission.set(
      line.missionId,
      (quarterDaysByMission.get(line.missionId) ?? 0) + line.quarterDays,
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
  for (const [missionId, quarterDays] of [...quarterDaysByMission].sort()) {
    const rate = rates.get(missionId);
    // A Forfait mission has no dated Tjm. It is skipped rather than counted at zero, which would
    // report a loss equal to its cost on a mission that is not sold by the day.
    if (rate === undefined) continue;

    const tjmCents = exactCents('tjm_cents', rate.tjm_cents);
    // Through `billing`'s helper, which is the single call site allowed to divide and the one
    // that asserts its precondition (BUILD-RULES § Money). The API does no money arithmetic of
    // its own beyond adding these integers together.
    const revenueCents = lineAmountCents(quarterDays, tjmCents);
    const costCents = lineAmountCents(quarterDays, cjmCents);

    missions.push({
      missionId,
      missionName: rate.mission_name,
      quarterDays,
      tjmCents,
      revenueCents,
      costCents,
      marginCents: revenueCents - costCents,
    });
  }

  const revenueCents = missions.reduce((total, mission) => total + mission.revenueCents, 0);
  const costCents = missions.reduce((total, mission) => total + mission.costCents, 0);

  // The line that makes the disclosure attributable: **who** read **which fields** about **whom**.
  // It is here rather than in the two routes that serve this record (ADR-0052) so that a third
  // caller cannot exist without one — and it fires only on the path that returns data, because a
  // refusal is not a disclosure and every early return above is a refusal or an absence.
  dependencies.log.info(
    {
      disclosure: {
        actor: input.actor.consultantId,
        role: input.actor.role,
        target: input.consultantId,
        period: periodIso,
        fields: DISCLOSED_FIELDS,
      },
    },
    'sensitive fields disclosed',
  );

  return {
    consultantId: input.consultantId,
    displayName: `${consultant.first_name} ${consultant.last_name}`,
    period: periodIso,
    cjmCents,
    missions,
    revenueCents,
    costCents,
    marginCents: revenueCents - costCents,
  };
}
