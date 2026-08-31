import type { Actor, Clock, IsoDate, Period } from '@erp/platform';
import { Cra, type CraFlag, type RecordedDayType, workingCalendar } from '@erp/timesheet';

import { PgReferenceReader } from '../persistence/reference-reader.ts';
import type { Transactionally } from '../persistence/unit-of-work.ts';

/**
 * Recording a month, and submitting it (ADR-0050).
 *
 * One entry point for both representations: the screen posts a form to it and `/api/v1` sends it
 * JSON. Neither owns the rule, and there is no second copy of "replace the month, then maybe
 * submit" to keep in step.
 *
 * **The consultant is the actor, never the URL.** The path carries a period and nothing else, so
 * "may I write someone else's month" is not a question this code answers — it is a question it
 * cannot be asked. The repository's `own` scope (ADR-0003) still guards the read, and the route's
 * `forRoles('consultant')` still guards the action; this removes the third check rather than
 * adding one.
 */

/**
 * One matrix cell (ADR-0070): one activity, one day, one quantity. There is deliberately **no
 * slot number** — the half-day grid this replaced had a morning box and an afternoon box, but
 * which of the two a half-day came from changed nothing (not the invoice, not the totals, not a
 * rule), which is why that concept never travelled past the screen and does not survive here
 * either. What a cell carries instead is its own count of quarter-days (ADR-0069): the matrix has
 * one cell per `(day, dayType, missionId)`, so the quantity belongs on the entry, not on a count
 * of how many entries there are.
 */
export interface QuarterDayEntry {
  readonly day: IsoDate;
  readonly dayType: RecordedDayType;
  /** `null` for an absence — `craLine` refuses a mission on a day that was not worked. */
  readonly missionId: string | null;
  readonly quarterDays: number;
}

export interface RecordMonthDependencies {
  readonly transactionally: Transactionally;
  readonly clock: Clock;
  readonly newId: () => string;
}

export interface RecordMonthCommand {
  readonly actor: Actor;
  readonly period: Period;
  readonly entries: readonly QuarterDayEntry[];
  /** Whether to hand the month to the manager once it is saved. */
  readonly submit: boolean;
}

export interface RecordMonthOutcome {
  readonly craId: string;
  readonly status: string;
  readonly flags: readonly CraFlag[];
}

interface MonthLine {
  day: IsoDate;
  dayType: RecordedDayType;
  missionId: string | null;
  quarterDays: number;
}

/**
 * One `(day, dayType, missionId)` triplet is one line — and, since ADR-0070, one matrix cell.
 * With a quantity carried on the entry, two entries for the same triplet are not a normal write:
 * the grid has exactly one cell for it. They **sum** into a single line rather than being refused,
 * which keeps the property that matters (one line per triplet, so one line per cell) and leaves
 * `DayOverbookedError` to refuse the day if the total exceeds it.
 *
 * Until 26/08/2026 this grouped by a slot-count heuristic instead — two identical entries were one
 * two-half-day line, anything else was one line per entry — because the wire carried no quantity
 * and a duplicate entry was the only way to say "a full day". ADR-0069 put the quantity on the
 * entry and ADR-0070 put one cell per triplet on the screen; a duplicate triplet producing two
 * lines would be the lossy round trip ADR-0066 existed to prevent, reappeared one layer down.
 *
 * Grouping happens here, at the edge, because it is a fact about the *form* the screen posts and
 * not about the record.
 */
function linesOf(entries: readonly QuarterDayEntry[]): MonthLine[] {
  const byTriplet = new Map<string, MonthLine>();

  for (const entry of entries) {
    // Written as an escape, never as the byte itself: a raw NUL in the source makes git treat
    // this file as binary, and a diff nobody can read is a review nobody performs.
    const key = `${entry.day}\u0000${entry.dayType}\u0000${entry.missionId ?? ''}`;
    const existing = byTriplet.get(key);

    if (existing === undefined) {
      byTriplet.set(key, {
        day: entry.day,
        dayType: entry.dayType,
        missionId: entry.missionId,
        quarterDays: entry.quarterDays,
      });
    } else {
      existing.quarterDays += entry.quarterDays;
    }
  }

  return [...byTriplet.values()].sort((left, right) => left.day.localeCompare(right.day));
}

/**
 * Replaces the month, and submits it if asked. Both happen in one transaction: a save that half
 * succeeded would leave a Cra that is neither the old month nor the new one.
 *
 * A month with no Cra yet is opened here rather than by the `GET` that rendered the empty grid —
 * a read does not write, so the first save is what brings the record into existence.
 */
export async function recordMonth(
  dependencies: RecordMonthDependencies,
  command: RecordMonthCommand,
): Promise<RecordMonthOutcome> {
  // Before anything is written, and not only before a submission: the holiday table is dated
  // (ADR-0004) and a month the firm has no calendar for is a month no rule can judge. This throws
  // `UnknownCalendarYearError` — the existing typed refusal, not a second copy of the rule — so a
  // hand-crafted `PUT` for 1999 is refused where the grid for 1999 already refuses to render.
  const calendar = workingCalendar();
  calendar.workableDaysOf(command.period);

  return dependencies.transactionally(async (unit) => {
    const existing = await unit.cras.findByConsultantAndPeriod(
      command.actor.consultantId,
      command.period,
      command.actor,
    );

    // A Cra that has been submitted or validated refuses `recordDay` from the domain (ADR-0005),
    // and that refusal is the answer: it reaches the caller as a typed 409 naming the transition,
    // rather than being second-guessed here. Re-checking the status at the edge would be a second
    // copy of a rule the aggregate already holds.
    const cra =
      existing ??
      Cra.open({
        id: dependencies.newId(),
        consultantId: command.actor.consultantId,
        officeId: command.actor.officeId,
        period: command.period,
        // Never a departed consultant here (ADR-0079): a departure erases nobody's persona, but
        // `personas` (`apps/api/src/personas/catalogue.ts`) never selects one, and this route
        // opens a CRA only for `command.actor` themselves — never on behalf of a third party.
        consultantDeparture: null,
      });

    // Replace rather than merge. The form posts the whole month, so a day the consultant emptied
    // is a day that must disappear — and a merge cannot tell "left blank" from "not sent".
    for (const day of new Set(cra.lines.map((line) => line.day))) cra.clearDay(day);
    for (const line of linesOf(command.entries)) cra.recordDay(line);

    if (command.submit) {
      const reference = new PgReferenceReader(unit.client);
      cra.submit({
        clock: dependencies.clock,
        calendar,
        reference: await reference.timesheet(),
      });
    }

    await unit.cras.save(cra);

    return { craId: cra.id, status: cra.status, flags: cra.flags };
  });
}
