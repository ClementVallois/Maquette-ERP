import type { PgReadClient } from '../persistence/pg-client.ts';

/**
 * Item 3, QA round 5 (ADR-0098): a manager's office headcount, split by whether each consultant is
 * currently staffed on a client mission or sitting in `Intercontrat`. `CONTEXT.md`'s own
 * `Intercontrat` entry is the discriminator this reads: "modelled as an internal `Forfait` mission
 * named `Intercontrat`" (ADR-0046) — there is no boolean column and no separate table, only a
 * mission whose name this constant matches. Nothing in `packages/timesheet` or `packages/billing`
 * reads this name today; this is the first thing that does, at the application layer, the same way
 * `assignment-admin.ts` already queries `public.missions`/`public.assignments` directly rather than
 * through a module port (there is no "staffing snapshot" port and no second implementation to
 * justify one, ADR-0047).
 */
export const INTERCONTRAT_MISSION_NAME = 'Intercontrat';

export interface ManagerStaffingSnapshot {
  readonly onMission: number;
  readonly intercontrat: number;
}

interface StaffingRow {
  on_mission: boolean;
}

/**
 * "As of today", not as of the dashboard's `?period=` (ADR-0098's own reasoning): staffing is who
 * is *currently* on a mission, an operational fact the way `assignmentCatalogue`'s own `today`
 * parameter already treats it — not a monthly figure like `billableCents`, which is genuinely
 * about one period's activity. A consultant with more than one assignment active today counts as
 * `onMission` if **any** of them is not `Intercontrat` — staffed on real work takes precedence over
 * also carrying an `Intercontrat` row, rather than the two cancelling out into neither bucket.
 *
 * Scoped by `office_id` at the query itself (`BUILD-RULES` § Authorization: "a manager reads their
 * own office, never another's"), the same way `consultantsOfOffice` is — a manager of one office
 * cannot see another office's split by asking this function for it.
 */
export async function managerStaffingSnapshot(
  client: PgReadClient,
  officeId: string,
  today: string,
): Promise<ManagerStaffingSnapshot> {
  const { rows } = await client.query<StaffingRow>(
    `SELECT bool_or(m.name <> $3) AS on_mission
       FROM public.consultants c
       JOIN public.assignments a ON a.consultant_id = c.id
        AND a.from_date <= $2 AND (a.to_date IS NULL OR a.to_date >= $2)
       JOIN public.missions m ON m.id = a.mission_id
      WHERE c.office_id = $1 AND c.role = 'consultant' AND c.departure_date IS NULL
      GROUP BY c.id`,
    [officeId, today, INTERCONTRAT_MISSION_NAME],
  );

  let onMission = 0;
  let intercontrat = 0;
  for (const row of rows) {
    if (row.on_mission) onMission += 1;
    else intercontrat += 1;
  }

  return { onMission, intercontrat };
}
