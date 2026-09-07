import type { CraGridResponse } from './types';

/**
 * `CraGridBody`'s render-time resync (ADR-0067: "the grid's in-memory edit is rebuilt from the
 * server's own answer whenever `data` changes reference — a fresh fetch for a new period, or the
 * refetch a successful save triggers") used to be safe to run unconditionally, because nothing
 * but this grid's own save ever invalidated its query. Package 10's cross-tab/persona-change
 * sweep (`features/session/cross-tab-sync.ts`) matches every query with no per-feature
 * exemption — deliberately, per that module's own comment — so a fresh `data` reference can now
 * arrive for a reason that has nothing to do with this consultant's edits: another tab, a
 * reconnection. Left unconditional, `CraGridBody` would silently discard unsaved edits the moment
 * that happened, exactly the "do not let a response reset edits the request never contained"
 * failure the audit's package 11 Work item names.
 *
 * Kept pure and separate from the component, the same reasoning `matrix.ts`'s own header gives
 * for the cell-level state it owns: tested directly, without a rendered tree.
 */
export type GridResyncDecision =
  { readonly kind: 'unchanged' } | { readonly kind: 'holdAsConflict' } | { readonly kind: 'adopt' };

export interface GridResyncInput {
  /** The `data` this render just received from `useCraGrid`. */
  readonly incoming: CraGridResponse;
  /** The reference the grid's local state was last built from. */
  readonly syncedWith: CraGridResponse;
  /** Whether the grid holds edits the consultant has not saved. */
  readonly dirty: boolean;
  /** A previously-held conflict, if `decideGridResync` already returned `'holdAsConflict'` for
   * an earlier render and the consultant has not yet resolved it. */
  readonly pendingRemoteData: CraGridResponse | null;
  /**
   * Whether this grid's own save mutation (`useSaveMonth`) is currently in flight — including
   * its own `onSuccess`, which awaits `invalidateAfterSaveMonth` before resolving
   * (`cra/hooks.ts`). That await is exactly the window this function has to reason about: the
   * grid's own query observer sees the refetched `data` — and this component re-renders with it
   * — *before* `handleSubmitMonth`'s `await saveMonth.mutateAsync(...)` continuation runs and
   * calls `setDirty(false)`, confirmed empirically (`grid-resync.test.ts`'s own "own save still
   * in flight" case: `query-core`'s mutation dispatches `success` only after `onSuccess`
   * settles, per `mutation.ts`, so the observer notification the invalidated refetch triggers
   * happens strictly first). Without this field, that render sees `dirty: true` for data this
   * grid's own save just produced and would wrongly hold it as a conflict — a real regression
   * caught after the first version of this function shipped, not a hypothetical.
   */
  readonly savePending: boolean;
}

/**
 * `'unchanged'`: nothing to do — either `incoming` is already what local state was built from,
 * or it is the exact conflict already being held (re-checked on every render; without this, a
 * conflict already surfaced would keep re-triggering its own state update every time the
 * component re-renders for any unrelated reason, since object identity alone cannot tell "already
 * flagged" from "flag again" without this comparison).
 *
 * `'holdAsConflict'`: `incoming` is a genuinely new reference, the grid has unsaved edits, and no
 * save of this grid's own is in flight to explain where `incoming` came from — the caller must
 * not touch `matrix`/`syncedWith`, only record `incoming` as the pending conflict for the
 * consultant to resolve explicitly.
 *
 * `'adopt'`: either there is nothing unsaved to protect, or `savePending` says this grid's own
 * save produced `incoming` — the caller performs the existing ADR-0067 reset (`syncedWith`,
 * `matrix`, `dirty`, and every other per-period UI state) exactly as it always has. Adopting
 * while `savePending` is still `true` is safe specifically because `canEdit`
 * (`cra-grid-screen.tsx`) has already locked every edit path for the same window — there is no
 * newer, unsaved edit this render could be discarding.
 */
export function decideGridResync(input: GridResyncInput): GridResyncDecision {
  if (input.incoming === input.syncedWith) return { kind: 'unchanged' };
  if (!input.dirty || input.savePending) return { kind: 'adopt' };
  if (input.incoming === input.pendingRemoteData) return { kind: 'unchanged' };
  return { kind: 'holdAsConflict' };
}
