import { describe, expect, it } from 'vitest';

import { decideGridResync } from './grid-resync';
import type { CraGridResponse } from './types';

/**
 * Package 11: the regression package 10 opened. `CraGridBody`'s render-time resync (ADR-0067)
 * used to be safe to run unconditionally on every `data` reference change, because nothing but
 * this grid's own save ever invalidated its query. Package 10's cross-tab/persona-change sweep
 * (`cross-tab-sync.ts`) matches every query with no per-feature exemption, so a fresh `data`
 * reference can now arrive for a reason that has nothing to do with this consultant's edits — a
 * second tab, a reconnection. `decideGridResync` is the one decision point, kept pure so it is
 * tested directly rather than through a rendered tree (`matrix.ts`'s own header gives the same
 * reasoning for the same separation, applied here to a sibling concern).
 *
 * The `savePending` cases below were added after an advisor review of the first version of this
 * file caught a second-order regression: that version held any dirty-and-changed reference as a
 * conflict, including the grid's own successful save — `cra/hooks.ts`'s
 * `invalidateAfterSaveMonth` resolves strictly after the invalidated grid query's own refetch has
 * already reached this component (`query-core`'s mutation dispatches `success` only once
 * `onSuccess` settles), which is strictly before `handleSubmitMonth` gets to call
 * `setDirty(false)`. A consultant who successfully saved would have seen the conflict banner.
 */

function fakeData(): CraGridResponse {
  // Only object identity matters to every case below — `decideGridResync` never reads a field.
  return {} as unknown as CraGridResponse;
}

describe('decideGridResync', () => {
  it('reports "unchanged" when the incoming reference is the one already synced', () => {
    const data = fakeData();

    expect(
      decideGridResync({
        incoming: data,
        syncedWith: data,
        dirty: false,
        pendingRemoteData: null,
        savePending: false,
      }),
    ).toStrictEqual({ kind: 'unchanged' });
  });

  it('adopts a new reference outright when there are no unsaved edits', () => {
    const syncedWith = fakeData();
    const incoming = fakeData();

    expect(
      decideGridResync({
        incoming,
        syncedWith,
        dirty: false,
        pendingRemoteData: null,
        savePending: false,
      }),
    ).toStrictEqual({ kind: 'adopt' });
  });

  it(
    'holds a new reference as a conflict instead of adopting it, when there are unsaved edits ' +
      'and no save of this grid’s own is in flight (the case that was silently overwriting them ' +
      'before this package)',
    () => {
      const syncedWith = fakeData();
      const incoming = fakeData();

      expect(
        decideGridResync({
          incoming,
          syncedWith,
          dirty: true,
          pendingRemoteData: null,
          savePending: false,
        }),
      ).toStrictEqual({ kind: 'holdAsConflict' });
    },
  );

  it(
    'adopts a new reference even while dirty, when this grid’s own save is still in flight ' +
      '(the second-order regression an advisor review caught in the first version of this ' +
      "function: a successful save's own refetch would otherwise be held as a conflict, " +
      'because setDirty(false) has not run yet at the moment this data arrives)',
    () => {
      const syncedWith = fakeData();
      const incoming = fakeData();

      expect(
        decideGridResync({
          incoming,
          syncedWith,
          dirty: true,
          pendingRemoteData: null,
          savePending: true,
        }),
      ).toStrictEqual({ kind: 'adopt' });
    },
  );

  it('does not re-flag the same pending reference on every render while a conflict is unresolved', () => {
    const syncedWith = fakeData();
    const pendingRemoteData = fakeData();

    expect(
      decideGridResync({
        incoming: pendingRemoteData,
        syncedWith,
        dirty: true,
        pendingRemoteData,
        savePending: false,
      }),
    ).toStrictEqual({ kind: 'unchanged' });
  });

  it('flags a second, different conflicting reference even while an earlier one is still pending', () => {
    const syncedWith = fakeData();
    const firstPending = fakeData();
    const secondIncoming = fakeData();

    expect(
      decideGridResync({
        incoming: secondIncoming,
        syncedWith,
        dirty: true,
        pendingRemoteData: firstPending,
        savePending: false,
      }),
    ).toStrictEqual({ kind: 'holdAsConflict' });
  });
});
