import type { CellQuantity } from './components/cra-quantity-cell';
import type { CraGridResponse, MonthEntry } from './types';

/**
 * The matrix's local state (ADR-0070): one row per activity — a mission id, or the fixed
 * `ABSENCE_ROW_KEY` — one column per day, one cell holding a quantity in quarter-days. This module
 * is pure: no fetch, no React, testable without either — the counterpart `slots.ts` never had
 * (ADR-0070 deletes it rather than ports it, and this is the module that replaces its job).
 *
 * A cell maps one-to-one onto a `CraLine` (ADR-0070's own point): the key is
 * `(rowKey, day)`, exactly the domain's `(missionId | null, day)` pair once `dayType` is read off
 * which row a key belongs to.
 */

export const ABSENCE_ROW_KEY = 'absence';

export interface MatrixState {
  /** Which rows are visible, in display order — missions first (in `missions[]`'s own order),
   * `ABSENCE_ROW_KEY` always last. A row stays visible once added, even emptied (task 6.3: "vider
   * la ligne : la ligne reste"), until explicitly removed. */
  readonly rowOrder: readonly string[];
  readonly cells: ReadonlyMap<string, CellQuantity>;
}

// Written as an escape, never as the byte itself: a raw NUL in the source makes git treat this
// file as binary, and a diff nobody can read is a review nobody performs.
const KEY_SEPARATOR = '\u0000';

function cellKey(rowKey: string, day: string): string {
  return `${rowKey}${KEY_SEPARATOR}${day}`;
}

function isCellQuantity(value: number): value is CellQuantity {
  return value === 0 || value === 1 || value === 2 || value === 3 || value === 4;
}

/** The initial matrix from a `GET .../grid` response: one row per mission that carries at least
 * one recorded quarter (front-end plan §6.2), plus the Absence row, always. */
export function initMatrix(data: CraGridResponse): MatrixState {
  const missionIdsWithData = new Set<string>();
  const cells = new Map<string, CellQuantity>();

  for (const line of data.lines) {
    const rowKey =
      line.dayType === 'absence' ? ABSENCE_ROW_KEY : (line.missionId ?? ABSENCE_ROW_KEY);
    if (rowKey !== ABSENCE_ROW_KEY) missionIdsWithData.add(rowKey);
    const quantity = isCellQuantity(line.quarterDays) ? line.quarterDays : 0;
    cells.set(cellKey(rowKey, line.day), quantity);
  }

  const knownOrder = data.missions
    .map((mission) => mission.missionId)
    .filter((id) => missionIdsWithData.has(id));
  // A line can name a mission the grid no longer offers (staffing ended, or the composition's own
  // `assignableDays.length > 0` filter excluded it) — shown anyway, at the end, rather than
  // silently dropped: the recorded day is real even if the mission is no longer pickable.
  const unknownOrder = [...missionIdsWithData].filter((id) => !knownOrder.includes(id));

  return { rowOrder: [...knownOrder, ...unknownOrder, ABSENCE_ROW_KEY], cells };
}

export function valueAt(matrix: MatrixState, rowKey: string, day: string): CellQuantity {
  return matrix.cells.get(cellKey(rowKey, day)) ?? 0;
}

export function withValue(
  matrix: MatrixState,
  rowKey: string,
  day: string,
  value: CellQuantity,
): MatrixState {
  const cells = new Map(matrix.cells);
  const key = cellKey(rowKey, day);
  if (value === 0) cells.delete(key);
  else cells.set(key, value);

  return { ...matrix, cells };
}

/** Adds a row just before Absence — a no-op if the row is already visible. */
export function addRow(matrix: MatrixState, rowKey: string): MatrixState {
  if (matrix.rowOrder.includes(rowKey)) return matrix;
  const withoutAbsence = matrix.rowOrder.filter((key) => key !== ABSENCE_ROW_KEY);

  return { ...matrix, rowOrder: [...withoutAbsence, rowKey, ABSENCE_ROW_KEY] };
}

/** task 6.3: "retirer la ligne" — the row disappears; its cells go with it (it was empty, or the
 * caller would not have offered the tool). */
export function removeRow(matrix: MatrixState, rowKey: string): MatrixState {
  const cells = new Map(matrix.cells);
  for (const key of cells.keys()) {
    if (key.startsWith(`${rowKey}${KEY_SEPARATOR}`)) cells.delete(key);
  }

  return { rowOrder: matrix.rowOrder.filter((key) => key !== rowKey), cells };
}

/** task 6.3: "vider la ligne" — the row's cells clear, the row stays. */
export function clearRow(matrix: MatrixState, rowKey: string): MatrixState {
  const cells = new Map(matrix.cells);
  for (const key of cells.keys()) {
    if (key.startsWith(`${rowKey}${KEY_SEPARATOR}`)) cells.delete(key);
  }

  return { ...matrix, cells };
}

const FULL_DAY: CellQuantity = 4;

/**
 * task 6.3: "remplir les jours ouvrés vides" — a full day on every **workable** day this row is
 * assignable on and whose total (across every row, not just this one) is currently nil. Never
 * touches a day already carrying anything, on this row or another — the guarantee that this tool
 * "ne peut jamais surbooker".
 */
export function fillEmptyWorkdays(
  matrix: MatrixState,
  rowKey: string,
  workableDays: readonly string[],
  assignableDays: ReadonlySet<string> | null,
): MatrixState {
  const cells = new Map(matrix.cells);
  for (const day of workableDays) {
    if (assignableDays !== null && !assignableDays.has(day)) continue;
    if (dayTotal(matrix, day) > 0) continue;
    cells.set(cellKey(rowKey, day), FULL_DAY);
  }

  return { ...matrix, cells };
}

export function rowTotal(matrix: MatrixState, rowKey: string, days: readonly string[]): number {
  return days.reduce((total, day) => total + valueAt(matrix, rowKey, day), 0);
}

/**
 * Sums every cell recorded for `day`, across the whole map rather than `rowOrder` — a cell can
 * only ever be written through a visible row's control, so in practice the two agree, but reading
 * the map directly means this number is correct even if a caller ever came to hold a cell for a
 * row it had not (yet) added to `rowOrder`, rather than silently under-counting.
 */
export function dayTotal(matrix: MatrixState, day: string): number {
  const suffix = `${KEY_SEPARATOR}${day}`;
  let total = 0;
  for (const [key, value] of matrix.cells) {
    if (key.endsWith(suffix)) total += value;
  }

  return total;
}

/**
 * task 6.2's own reading of the domain's `DayOverbookedError`: the grid decides nothing, it only
 * mirrors the same bound the domain enforces at `PUT .../entries` (`quarterDays > 4` on one day)
 * so the write can be signalled before it is attempted, not just refused after.
 */
export function isDayOverbooked(matrix: MatrixState, day: string): boolean {
  return dayTotal(matrix, day) > FULL_DAY;
}

/**
 * The other half of the same invariant `isDayOverbooked` mirrors — `assertMonthAddsUp` →
 * `IncompleteCraError`: a workable day the month does not account for. Workability is not the
 * matrix's to know (it holds no calendar); the caller filters on `days[].nonWorkable` first.
 *
 * `flaggedByServer` is what keeps an untouched month from opening entirely amber: a day nobody has
 * typed into yet is not a mistake, it is a day not reached. It becomes one only when the server
 * has refused the submission over it — `missingDays` off `/problems/cra-incomplete` — and it stops
 * being one as soon as the day adds up, without waiting for a second refusal to say so.
 */
export function isDayIncomplete(
  matrix: MatrixState,
  day: string,
  flaggedByServer: boolean,
): boolean {
  const total = dayTotal(matrix, day);

  return total < FULL_DAY && (total > 0 || flaggedByServer);
}

export function isRowEmpty(matrix: MatrixState, rowKey: string, days: readonly string[]): boolean {
  return rowTotal(matrix, rowKey, days) === 0;
}

/**
 * The progress-bar signal (A9): a workable day is "complete" once it carries exactly one full day,
 * across every row — neither short (`isDayIncomplete`) nor over (`isDayOverbooked`). The caller
 * filters on `days[].nonWorkable` first, same as `isDayIncomplete` — this function holds no
 * calendar of its own.
 */
export function isDayComplete(matrix: MatrixState, day: string): boolean {
  return dayTotal(matrix, day) === FULL_DAY;
}

/** One `MonthEntry` per non-empty cell (ADR-0070) — the shape `PUT /api/v1/cras/:period/entries`
 * wants, one entry per matrix cell rather than per slot: the server's own `linesOf` would group
 * these right back into the `CraLine`s they came from, so nothing here groups anything itself. */
export function entriesFromMatrix(matrix: MatrixState): MonthEntry[] {
  const entries: MonthEntry[] = [];

  for (const [key, quantity] of matrix.cells) {
    if (quantity === 0) continue;
    const separatorIndex = key.indexOf(KEY_SEPARATOR);
    if (separatorIndex < 0) continue;
    const rowKey = key.slice(0, separatorIndex);
    const day = key.slice(separatorIndex + 1);

    entries.push(
      rowKey === ABSENCE_ROW_KEY
        ? { day, dayType: 'absence', missionId: null, quarterDays: quantity }
        : { day, dayType: 'worked', missionId: rowKey, quarterDays: quantity },
    );
  }

  return entries;
}
