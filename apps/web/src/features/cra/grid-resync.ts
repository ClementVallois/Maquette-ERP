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
}

/**
 * `'unchanged'`: nothing to do — either `incoming` is already what local state was built from,
 * or it is the exact conflict already being held (re-checked on every render; without this, a
 * conflict already surfaced would keep re-triggering its own state update every time the
 * component re-renders for any unrelated reason, since object identity alone cannot tell "already
 * flagged" from "flag again" without this comparison).
 *
 * `'holdAsConflict'`: `incoming` is a genuinely new reference and the grid has unsaved edits —
 * the caller must not touch `matrix`/`syncedWith`, only record `incoming` as the pending
 * conflict for the consultant to resolve explicitly.
 *
 * `'adopt'`: `incoming` is new and there is nothing unsaved to protect — the caller performs
 * the existing ADR-0067 reset (`syncedWith`, `matrix`, `dirty`, and every other per-period UI
 * state) exactly as it always has.
 */
export function decideGridResync(input: GridResyncInput): GridResyncDecision {
  if (input.incoming === input.syncedWith) return { kind: 'unchanged' };
  if (!input.dirty) return { kind: 'adopt' };
  if (input.incoming === input.pendingRemoteData) return { kind: 'unchanged' };
  return { kind: 'holdAsConflict' };
}
