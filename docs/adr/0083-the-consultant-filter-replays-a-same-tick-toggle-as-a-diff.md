# ADR-0083 — The manager's CRA filters replay a same-tick toggle as a diff, not as a snapshot

- **Date**: 2026-09-01
- **Status**: accepted

## Context

Item 3 (QA round 2) reported the consultant selector on the manager's `/cra` list closing the
instant a checkbox was ticked. The actual cause (found by instrumenting, not assumed): ticking a
box calls `CraListFilters.setConsultantIds`, which `navigate()`s to a new `?consultantIds=…` URL.
That changed `useCraList`'s query key, which briefly flipped `isPending` back to `true`, and
`CraListScreen` swapped its whole render tree for `<ListSkeleton />` — unmounting
`MultiSelectCombobox` along with everything else, and resetting its own local `open` state on
remount. Fixed with `placeholderData: keepPreviousData` on `craListQueryOptions`
(`features/cra/hooks.ts`): the previous page's rows now stay on screen through a filter refetch,
so nothing unmounts the popover and the skeleton-flip bug disappears.

That fix changes what the popover's normal interaction looks like: before it, the popover closed
after one tick, so a second toggle before that remount could never fire against the same
`MultiSelectCombobox` instance. After it, the popover stays open and mounted, and clicking a
second checkbox in quick succession — the entire point of a multi-select — became the normal
path, not an edge case.

`MultiSelectCombobox`'s `toggle` computes its `next` selection from the `selected` **prop**
`CraListFilters` handed it, and calls `onChange(next)`. The original `setConsultantIds` wrote that
`next` straight into the URL: `search: (prev) => ({ ...prev, consultantIds: next })`. If two
`onChange` calls fire in the same task — before React has re-rendered `CraListFilters` with the
first navigation's result — both compute `next` from the same, now-stale `consultantIds` prop, and
the second `navigate()` overwrites `prev.consultantIds` (which the router has, by then, already
updated for the first click) with a `next` that never included it. The first click's id is
silently dropped.

Whether this reproduces under an ordinary user's clicks was an open question until checked, not
assumed. Two separately-`await`ed `page.click()` calls in Playwright do **not** reproduce it: each
click's own actionability wait is enough of a task boundary for React to flush the first
navigation's render before the second click's handler runs. Only dispatching both native `click`
events from a single `page.evaluate()` — genuinely the same task — reproduces the drop, verified
both ways: that test fails (one id lands, not two) against a build with this ADR's machinery
removed, and passes against this one (`apps/web/e2e/journeys.spec.ts`, "items 3 + 11" describe
block, "two same-tick clicks…"). So the trigger is narrower than "click quickly" — it needs two
`onChange` calls genuinely queued in the same task (a double-click landing on two different
checkboxes, or any future batch/keyboard-driven toggle that fires more than one `onChange`
synchronously) — but it is real, not hypothetical, and it is exactly the kind of drop a manager
filtering a long consultant list would have no way to notice: the popover shows both boxes ticked
(that state is read straight from the URL-derived `consultantIds` prop after the last render), the
URL just quietly doesn't carry both.

## Decision

`CraListFilters` never writes `next` into the URL verbatim. `toggleDiff(current, next)` names the
single value that changed, diffing `next` against `current` — the exact `consultantIds`/`statuses`
prop `next` was computed from, the one baseline the diff is guaranteed to be exactly one value
from, since `MultiSelectCombobox.toggle`/`TogglePillGroup`'s own toggle never changes more than one
value at a time. `applyDiff(prev, diff)` replays that single change against `search`'s own `prev`,
which the router keeps authoritative regardless of React's render timing — so a diff computed
against a stale `current` still lands correctly against whatever the URL actually holds by the time
it applies, instead of overwriting it.

`next.length === 0` is ambiguous taken alone: `toggle` unticking the last remaining box
(`current.length === 1`) and the explicit "Effacer les filtres" button (`onChange([])`, reachable
from any `current`) both produce it, and only one of them means "wipe everything, including
whatever raced in ahead of it". Since `toggle` never removes more than one value at a time,
`current.length > 1` reaching `next.length === 0` in a single call is reachable only through the
explicit clear — that is the one case read as `{ kind: 'clear' }`. `current.length <= 1` is read as
`{ kind: 'remove', value: current[0] }` instead, so a stale, single-item `current` still removes
only that one value from the router's real (possibly longer) list.

## Rejected option

**Write `next` straight into the URL, as before item 3/11.** Simpler — no diff type, no two
helper functions — and correct for the overwhelming majority of interactions, which are single,
isolated toggles. Rejected because it is exactly the option that drops data under a same-tick
double toggle, demonstrated by the e2e test above failing against it. Once `keepPreviousData` made
the popover stay open and multi-box selection the designed interaction, "correct except under fast
multi-selection" was not an acceptable trade for the one control whose entire job is fast
multi-selection.

**Move `consultantIds`/`statuses` out of the URL into local component state**, sidestepping the
stale-prop problem entirely (a local `useState` reducer never races against a router re-render).
Rejected: item 7's own design already commits to URL-owned filter state on purpose — reloadable and
linkable, per `CraListFilters`'s existing comment on why `undefined` vs. `[]` matters for a clean
URL — and un-committing from that to fix a bug two-item-narrower than the feature itself is a
redesign, not a fix.

## Reconsideration threshold

If manager CRA filters ever stop being URL-owned state (a redesign that lifts them into a form or
a client-only store), this diff/replay machinery is protecting a data path that no longer exists
and should be deleted along with the URL wiring, not kept "just in case". If a third URL-owned
multi-select control needs the same protection, extract `toggleDiff`/`applyDiff` out of
`CraListFilters` into a shared helper rather than copy-pasting a third private copy.

## Consequences

Ticking boxes fast — including the pathological same-tick case a real user is unlikely to trigger
by hand but a double-click or a future batch action could — never silently drops a selection. The
cost is two private helper functions and a `next.length === 0` branch whose ambiguity has to be
reasoned about explicitly (documented in `cra-list-screen.tsx` itself) rather than left implicit;
the alternative was shipping the same silent-loss bug item 3/11 just finished fixing one layer up,
one interaction pattern later.

A second-order effect of `keepPreviousData` (the sibling fix this ADR's own Context section
describes) surfaced while writing this one: before it, every filter change forced a skeleton swap
that incidentally serialised rapid clicks — nothing could fire a second `onChange` before the first
one's remount reset the control. Removing that swap makes rapid sequential clicks the normal path,
which is the interaction this ADR protects; it also silently removed an implicit synchronisation
point one _existing_ e2e test (`item 7`'s status-pill assertions) had depended on without naming it,
which only failed under load (the full `journeys` project run, never in isolation) and was fixed in
the test itself — a wait on `aria-pressed`, not a change here. Named so the next person touching
`keepPreviousData` knows a click-ordering assumption elsewhere in the suite rests on it having been
added, not just on the skeleton flash being gone.
