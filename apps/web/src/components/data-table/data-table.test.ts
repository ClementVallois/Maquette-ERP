import { describe, expect, it } from 'vitest';

import {
  shouldActivateRow,
  type RowActivationOrigin,
  type RowActivationRelease,
} from './data-table.tsx';

/**
 * `onRowActivate` is a pointer-only convenience layered on top of the per-row `Link` every caller
 * already renders, so every one of these cases is a *false navigation*: a gesture that was not a
 * tap on this row, taking the reader somewhere they did not ask to go. `DataTable` itself has no
 * render harness in this repository (`apps/web` is tested through Playwright — see
 * `apps/web/e2e/`), so the decision is extracted as a pure function and covered directly, the same
 * split `pagination-controls.test.ts` uses.
 */
const ORIGIN: RowActivationOrigin = { x: 100, y: 200, t: 1_000, pointerId: 7, rowId: 'row-3' };

/** The release that *does* activate — every case below is this one with a single field changed. */
function tap(overrides: Partial<RowActivationRelease> = {}): RowActivationRelease {
  return {
    x: 100,
    y: 200,
    t: 1_000,
    pointerId: 7,
    rowId: 'row-3',
    selectionText: '',
    onInteractiveDescendant: false,
    ...overrides,
  };
}

describe('shouldActivateRow', () => {
  it('activates on a still tap released on the row it started on', () => {
    expect(shouldActivateRow(ORIGIN, tap())).toBe(true);
  });

  it('activates on the small jitter a finger leaves on a real screen', () => {
    // 9px on both axes: under the 10px threshold, which is what separates a tap from a scroll.
    expect(shouldActivateRow(ORIGIN, tap({ x: 109, y: 209, t: 1_400 }))).toBe(true);
  });

  it('refuses when there is no recorded origin at all', () => {
    // `pointercancel` clears the origin; a `pointerup` arriving after it must not activate.
    expect(shouldActivateRow(null, tap())).toBe(false);
  });

  it('refuses a release on a different row than the press started on', () => {
    // The reproduced bug: press near a row boundary, release 5px into the neighbour. Neither the
    // pressed row nor the released one may open.
    expect(shouldActivateRow(ORIGIN, tap({ rowId: 'row-4', y: 205 }))).toBe(false);
  });

  it('refuses a release from a different pointer than the one that pressed', () => {
    // A second finger landing mid-gesture: its `pointerup` carries another id and owns nothing.
    expect(shouldActivateRow(ORIGIN, tap({ pointerId: 8 }))).toBe(false);
  });

  it('refuses a hold — dwell at or past the 500ms budget', () => {
    expect(shouldActivateRow(ORIGIN, tap({ t: 1_500 }))).toBe(false);
    expect(shouldActivateRow(ORIGIN, tap({ t: 3_000 }))).toBe(false);
  });

  it('refuses a horizontal drag — the table wrapper scrolls sideways', () => {
    expect(shouldActivateRow(ORIGIN, tap({ x: 130 }))).toBe(false);
    // Direction is irrelevant: the threshold is on absolute movement.
    expect(shouldActivateRow(ORIGIN, tap({ x: 70 }))).toBe(false);
  });

  it('refuses a vertical drag — the page around the table scrolls', () => {
    expect(shouldActivateRow(ORIGIN, tap({ y: 240 }))).toBe(false);
    expect(shouldActivateRow(ORIGIN, tap({ y: 160 }))).toBe(false);
  });

  it('refuses a release that ends a text selection', () => {
    // Desktop: dragging across a cell to select its text ends in a `pointerup` on the row. Opening
    // the row there would both navigate and discard the selection the reader just made.
    expect(shouldActivateRow(ORIGIN, tap({ selectionText: 'FA-2026-0007' }))).toBe(false);
  });

  it('refuses a release inside a control the row nests', () => {
    // The `actions` column's own "Ouvrir" link owns its click; the row must not double-navigate.
    expect(shouldActivateRow(ORIGIN, tap({ onInteractiveDescendant: true }))).toBe(false);
  });
});
