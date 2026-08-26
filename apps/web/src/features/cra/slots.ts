import type { CraLine, MonthEntry } from './types';

/**
 * The day↔slots mapping ADR-0066 mirrors from `gridDays` (`apps/api/src/web/routes.ts`) and
 * `linesOf` (`apps/api/src/chain/record-month.ts`). See that ADR for why this is a deliberate
 * duplication rather than a shared import, and for the two behaviours the tests below are named
 * after.
 *
 * **Superseded by ADR-0070, kept only until Phase 6 replaces this screen's grid with the matrix.**
 * ADR-0069 moved the storage unit from the half-day to the quarter-day; this module's two-slot
 * shape did not move with it (that redesign is ADR-0070's, in `apps/web` Phase 6), so a slot here
 * keeps meaning what it always meant — half a day — now spelled as `SLOT_QUARTER_DAYS` quarter-days
 * rather than one half-day. This is the same adaptation `apps/api/src/web/routes.ts`'s own
 * two-slot legacy screen makes, for the same reason: neither screen's shape changed, only the unit
 * a slot is counted in.
 *
 * `slotsFor` is the read direction (one `CraLine[]` → the two boxes a day shows); `entriesFor` is
 * the write direction (every day's two boxes → the flat `MonthEntry[]` `PUT
 * /api/v1/cras/:period/entries` expects, one entry per filled slot, each carrying
 * `SLOT_QUARTER_DAYS` — the server's own `linesOf` sums entries of the same triplet into one line,
 * so this side never needs to group anything itself).
 */

export type SlotValue =
  | { readonly kind: 'empty' }
  | { readonly kind: 'absence' }
  | { readonly kind: 'mission'; readonly missionId: string };

const SLOT_COUNT = 2;
export const MORNING = 0;
export const AFTERNOON = 1;
/** What one slot of this two-slot legacy shape is worth, in the storage unit (ADR-0069). */
export const SLOT_QUARTER_DAYS = 2;

export type DaySlots = readonly [SlotValue, SlotValue];

const EMPTY_SLOT: SlotValue = { kind: 'empty' };

/**
 * Every line recorded on `day`, poured into the two slots in the order `lines` holds them —
 * `next < SLOT_COUNT` is what makes a full-day line fill both, and a line worth one slot always
 * lands in slot 0 (`MORNING`) rather than wherever it was originally typed, because nothing on the
 * wire says where that was (ADR-0066). A line worth an odd number of quarter-days (possible since
 * ADR-0069, never produced by this screen) rounds up to the nearest slot rather than being
 * dropped.
 */
export function slotsFor(lines: readonly CraLine[], day: string): DaySlots {
  const slots: [SlotValue, SlotValue] = [EMPTY_SLOT, EMPTY_SLOT];
  let next = 0;

  for (const line of lines.filter((candidate) => candidate.day === day)) {
    const value: SlotValue =
      line.dayType === 'absence'
        ? { kind: 'absence' }
        : { kind: 'mission', missionId: line.missionId ?? '' };

    const slotsForLine = Math.ceil(line.quarterDays / SLOT_QUARTER_DAYS);
    for (let taken = 0; taken < slotsForLine && next < SLOT_COUNT; taken += 1) {
      slots[next] = value;
      next += 1;
    }
  }

  return slots;
}

/**
 * The whole month's slots, flattened into one entry per filled slot — `submit`/period are not
 * this function's concern, only the shape `PUT .../entries`'s `entries` array wants.
 */
export function entriesFor(days: readonly { day: string; slots: DaySlots }[]): MonthEntry[] {
  const entries: MonthEntry[] = [];

  for (const { day, slots } of days) {
    for (const slot of slots) {
      if (slot.kind === 'empty') continue;

      entries.push(
        slot.kind === 'absence'
          ? { day, dayType: 'absence', missionId: null, quarterDays: SLOT_QUARTER_DAYS }
          : { day, dayType: 'worked', missionId: slot.missionId, quarterDays: SLOT_QUARTER_DAYS },
      );
    }
  }

  return entries;
}
