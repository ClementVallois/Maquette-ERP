import type { CraLine, MonthEntry } from './types';

/**
 * The day↔slots mapping ADR-0066 mirrors from `gridDays` (`apps/api/src/web/routes.ts`) and
 * `linesOf` (`apps/api/src/chain/record-month.ts`). See that ADR for why this is a deliberate
 * duplication rather than a shared import, and for the two behaviours the tests below are named
 * after.
 *
 * `slotsFor` is the read direction (one `CraLine[]` → the two boxes a day shows); `entriesFor` is
 * the write direction (every day's two boxes → the flat `MonthEntry[]` `PUT
 * /api/v1/cras/:period/entries` expects, one entry per filled half-day slot — the server's own
 * `linesOf` regroups two identical entries on one day into a single two-half-day line, so this
 * side never needs to group anything itself).
 */

export type SlotValue =
  | { readonly kind: 'empty' }
  | { readonly kind: 'absence' }
  | { readonly kind: 'mission'; readonly missionId: string };

const SLOT_COUNT = 2;
export const MORNING = 0;
export const AFTERNOON = 1;

export type DaySlots = readonly [SlotValue, SlotValue];

const EMPTY_SLOT: SlotValue = { kind: 'empty' };

/**
 * Every line recorded on `day`, poured into the two slots in the order `lines` holds them —
 * `next < SLOT_COUNT` is what makes a two-half-day line fill both, and a lone half-day always land
 * in slot 0 (`MORNING`) rather than wherever it was originally typed, because nothing on the wire
 * says where that was (ADR-0066).
 */
export function slotsFor(lines: readonly CraLine[], day: string): DaySlots {
  const slots: [SlotValue, SlotValue] = [EMPTY_SLOT, EMPTY_SLOT];
  let next = 0;

  for (const line of lines.filter((candidate) => candidate.day === day)) {
    const value: SlotValue =
      line.dayType === 'absence'
        ? { kind: 'absence' }
        : { kind: 'mission', missionId: line.missionId ?? '' };

    for (let taken = 0; taken < line.halfDays && next < SLOT_COUNT; taken += 1) {
      slots[next] = value;
      next += 1;
    }
  }

  return slots;
}

/**
 * The whole month's slots, flattened into one entry per filled half-day — `submit`/period are not
 * this function's concern, only the shape `PUT .../entries`'s `entries` array wants.
 */
export function entriesFor(days: readonly { day: string; slots: DaySlots }[]): MonthEntry[] {
  const entries: MonthEntry[] = [];

  for (const { day, slots } of days) {
    for (const slot of slots) {
      if (slot.kind === 'empty') continue;

      entries.push(
        slot.kind === 'absence'
          ? { day, dayType: 'absence', missionId: null }
          : { day, dayType: 'worked', missionId: slot.missionId },
      );
    }
  }

  return entries;
}
