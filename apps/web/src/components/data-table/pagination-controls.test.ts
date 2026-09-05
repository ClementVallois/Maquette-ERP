import { describe, expect, it } from 'vitest';

import { isPageOutOfRange, rangeOf } from './pagination-controls.tsx';

/**
 * F07: a page number a stale bookmark or another visitor's change made invalid must read
 * differently from "nothing matches these filters". `PaginationControls` itself has no render
 * harness in this repository (`apps/web` is tested through Playwright, not component unit tests —
 * see `apps/web/e2e/`), so this covers the one piece of logic three screens now share as a pure
 * function, directly.
 */
describe('isPageOutOfRange', () => {
  it('is false for a page inside the result set, including its exact last page', () => {
    // 24 results, page size 10: page 3 starts at offset 20, still short of 24.
    expect(isPageOutOfRange(3, 10, 24)).toBe(false);
  });

  it('is true for the reproduced case: a stale page far beyond the result set', () => {
    expect(isPageOutOfRange(999, 10, 24)).toBe(true);
  });

  it('is true for the page immediately past the last one', () => {
    // Offset 30 >= total 24: nothing left to show, unlike page 3 above.
    expect(isPageOutOfRange(4, 10, 24)).toBe(true);
  });

  it('is false when the result set is genuinely empty — that is a filtered-empty state, not an out-of-range one', () => {
    expect(isPageOutOfRange(1, 10, 0)).toBe(false);
    expect(isPageOutOfRange(999, 10, 0)).toBe(false);
  });

  it('turns a previously valid page out of range once the total shrinks under it', () => {
    // A manager's page 3 (offset 20) of 24 drafts is valid; a status change (one validated,
    // dropping the count to 20) leaves that same URL pointing nowhere.
    expect(isPageOutOfRange(3, 10, 24)).toBe(false);
    expect(isPageOutOfRange(3, 10, 20)).toBe(true);
  });
});

describe('rangeOf', () => {
  it('never reports a first value above the last or the total — the bug F07 reproduced', () => {
    // `page=999`, page size 10, total 24: the exact reproduction ("19961–24 sur 24 résultats").
    expect(rangeOf(9_980, 10, 24)).toStrictEqual({ first: 0, last: 0 });
  });

  it('reads 0–0 for a genuinely empty result set', () => {
    expect(rangeOf(0, 10, 0)).toStrictEqual({ first: 0, last: 0 });
  });

  it('reads the ordinary in-range values otherwise, capping the last page short of a full size', () => {
    expect(rangeOf(0, 10, 24)).toStrictEqual({ first: 1, last: 10 });
    expect(rangeOf(20, 10, 24)).toStrictEqual({ first: 21, last: 24 });
  });
});
