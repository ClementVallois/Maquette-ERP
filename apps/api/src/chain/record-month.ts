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
 * One half-day of one day. There is deliberately **no slot number**: the grid has a morning box and
 * an afternoon box because that is how a timesheet is filled in, but which of the two a half-day
 * came from changes nothing — not the invoice, not the totals, not a rule — so it is not recorded
 * and does not travel. A `slot` field here would be a value the code declares and never reads,
 * which in this repository is a defect rather than a nicety (ADR-0050 § 2).
 */
export interface HalfDayEntry {
  readonly day: IsoDate;
  readonly dayType: RecordedDayType;
  /** `null` for an absence — `craLine` refuses a mission on a day that was not worked. */
  readonly missionId: string | null;
}

export interface RecordMonthDependencies {
  readonly transactionally: Transactionally;
  readonly clock: Clock;
  readonly newId: () => string;
}

export interface RecordMonthCommand {
  readonly actor: Actor;
  readonly period: Period;
  readonly entries: readonly HalfDayEntry[];
  /** Whether to hand the month to the manager once it is saved. */
  readonly submit: boolean;
}

export interface RecordMonthOutcome {
  readonly craId: string;
  readonly status: string;
  readonly flags: readonly CraFlag[];
}

/**
 * Two half-days of the same day on the same mission are **one line of two half-days**, not two
 * lines of one. The domain permits either — `craLine` accepts one or two — and the difference is
 * visible on the invoice, where two lines of one half-day would print the same mission twice for
 * the same day.
 *
 * Grouping happens here, at the edge, because it is a fact about the *form* the screen posts and
 * not about the record.
 */
function linesOf(entries: readonly HalfDayEntry[]): {
  day: IsoDate;
  dayType: RecordedDayType;
  missionId: string | null;
  halfDays: number;
}[] {
  const byDay = new Map<IsoDate, HalfDayEntry[]>();
  for (const entry of entries) {
    const slots = byDay.get(entry.day) ?? [];
    slots.push(entry);
    byDay.set(entry.day, slots);
  }

  const lines: {
    day: IsoDate;
    dayType: RecordedDayType;
    missionId: string | null;
    halfDays: number;
  }[] = [];

  for (const [day, slots] of [...byDay].sort(([left], [right]) => left.localeCompare(right))) {
    const [first, second] = slots;
    if (first === undefined) continue;

    const identical =
      slots.length === 2 &&
      second?.dayType === first.dayType &&
      second.missionId === first.missionId;

    if (identical) {
      lines.push({ day, dayType: first.dayType, missionId: first.missionId, halfDays: 2 });
      continue;
    }

    for (const slot of slots) {
      lines.push({ day, dayType: slot.dayType, missionId: slot.missionId, halfDays: 1 });
    }
  }

  return lines;
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
