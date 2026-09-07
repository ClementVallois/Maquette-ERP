# ADR-0112 — Persona changes broadcast across tabs through `localStorage`, verified without a browser

- **Date**: 2026-09-07
- **Status**: accepted

## Context

Package 10 of the audit (`docs/clean-up-audit.consolidated.local.md`): "Make persona changes an
atomic client-data transition." Its evidence named four gaps in `features/session/hooks.ts` and
`lib/api-client.ts`: business query keys carry no persona identity, `apiFetch` accepted no
`AbortSignal`, an old response can outlive the persona that initiated it, and nothing defines how
a second tab learns that a different tab changed the shared persona cookie. Its own "Done when"
clause asks for "tests that deliberately delay requests and include two tabs."

Reading `hooks.ts` and its own extensive comments (QA rounds 1, 2 and item 9 already hardened the
same-tab behavior across three prior commits) against `@tanstack/query-core`'s actual source
settled which of the four gaps were real:

- **Query keys with no persona identity, and "an old response can outlive the persona that
  initiated it," same tab.** `query-core`'s retryer (`retryer.ts`) guards both `resolve()` and
  `reject()` behind an `isResolved()` flag that `cancel()` flips synchronously, before a
  superseded fetch's real network response can ever settle — verified by reading the source, not
  assumed. A same-tab race, once a query has already held settled data at least once, was already
  closed by the library's own cancellation semantics, undocumented anywhere in this codebase
  before this package.
- **The same race, but on a query's very first, never-yet-settled fetch.** Not closed.
  `Query.fetch()`'s own `cancelRefetch` branch is gated on `state.data !== undefined` — a query
  still on its first fetch has no data to gate on, so `invalidateQueries({ refetchType: 'active'
})` alone silently piggybacks on the same in-flight fetch rather than starting a new one, and
  whichever persona that fetch was built under wins. Confirmed both ways: a fail-first test with a
  deliberately held-open first response reproduces this exactly, and removing the one-line fix
  below reproduces it again on demand.
- **`apiFetch` accepted no `AbortSignal`.** Real, named twice by the audit, fixed in the two
  commits preceding this one (`799b52c`, `19ad390`) — a superseded fetch stayed logically
  cancelled but kept running on the wire, real wasted work rather than a cache-correctness bug.
- **Nothing defines cross-tab invalidation.** Real and entirely unaddressed: a second same-origin
  tab has its own independent `QueryClient`, and the only thing it shares with a tab that just
  changed persona is `document.cookie`, which neither tab's cache is watching.

## Decision

**Two structural pieces, one package:**

1. `invalidateOnPersonaChange` (moved from `hooks.ts` into a new `cross-tab-sync.ts`, unchanged in
   its two-branch `refetchType` reasoning) gains one line: `queryClient.cancelQueries()`, called
   before `invalidateQueries()`. `cancelQueries()` calls `query.cancel()` directly on every
   matching query regardless of whether it has ever settled, closing the still-open "first fetch"
   gap above with no further branching.
2. A new one-way broadcast: `broadcastPersonaChange()` writes a timestamp to a well-known
   `localStorage` key from inside each mutation's `onSuccess` (after calling
   `invalidateOnPersonaChange` for this tab), and `installCrossTabPersonaSync(queryClient)`,
   wired once from `App.tsx` alongside `installSessionGuard`, listens for the `storage` event that
   fires in every _other_ same-origin tab when that key changes — a platform guarantee (`storage`
   never fires in the document that did the writing), not a filter this code adds — and reacts by
   calling the same `invalidateOnPersonaChange(queryClient, 'active')` a same-tab mutation would.
   Always `'active'`, never `'none'`: the `'none'` branch exists only to avoid racing a same-tab
   `navigate()` already in flight (`useClearPersona`'s own case), and a tab reacting to a
   broadcast has no such navigation of its own this tick.

**Verified with `QueryObserver` and `vitest`'s default `node` environment, not a second Playwright
browser tab.** `QueryObserver` (from `@tanstack/react-query`, the same primitive `useQuery` is
built on) stands in for a mounted component with no React and no `@testing-library/react` — this
repository has neither, and `session-guard.test.ts` already establishes the pattern of driving a
real `QueryClient` directly rather than through a rendered tree. Both new functions take an
injectable seam (`broadcastPersonaChange`'s `writeTimestamp`, `installCrossTabPersonaSync`'s
`subscribe`) that a test can substitute with a plain recording function or an in-memory listener
set, in place of the real `localStorage`/`window.addEventListener('storage', …)` — the same seam
`installSessionGuard` already takes for `window.location.assign` via its own injectable
`redirectToSelector`. A fake two-way channel plays the part of "another tab" by calling the
listener directly; a deliberately held-open `Promise` (resolved only after the test asserts a
second fetch has already started) is what "deliberately delay requests" becomes without a real
network. The load-bearing test — a stale, still-open response resolving _after_ the broadcast has
already triggered a fresh fetch must never win — was confirmed failing with the `cancelQueries()`
line removed and passing with it restored, the same stash-and-restore discipline this branch's
correctness packages have used throughout.

## Rejected option

**A second Playwright browser tab** (`browser.newContext()`, two `page`s sharing one context's
cookie jar, `page.route()` with a manual `resolve()` to hold a response open — the literal reading
of the audit's "include two tabs," and a pattern this repository already has in
`mobile-usability.spec.ts` and `journeys.spec.ts`). Rejected for this package specifically, not in
general: the actual mechanism under test — `query-core`'s retryer semantics, and a `storage` event
listener — is fully exercisable by driving `@tanstack/react-query`'s own public API and a fake
implementation of two narrow browser primitives, with no dependency on real navigation timing, a
built SPA, or a reset-and-reseeded Postgres per run. A Playwright spec would prove the same claim
slower and with a wider blast radius of things that can make it flaky (network timing, dev-server
startup) for a claim that does not need any of them to be true.

**A DOM test environment (`jsdom`/`happy-dom`) added to the `unit` vitest project**, to use real
`window`/`localStorage`/`StorageEvent` instead of injectable seams. Rejected as new test
infrastructure for two browser primitives this file's own tests can substitute directly — the
`unit` project has run in Vitest's default `node` environment throughout this repository's history
(confirmed: no test before this package touched `window` or `localStorage`), and adding a DOM
purely to avoid two constructor-injected parameters would be exactly the kind of scope the
coordinator's own instruction on this package warned against opening without deciding it first.

**Query keys carrying an explicit persona/role/office component** (the Work item's first-listed
alternative to "replace the scoped cache as one transition"). Rejected: it would require touching
every feature's query-key function (the same ~15 call sites `19ad390` already swept once for
`AbortSignal`), for a property (`invalidateQueries()`/`removeQueries()` with no key filter,
matching every query) this repository's existing design already achieves without it — `hooks.ts`'s
own comment on `invalidateOnPersonaChange` already gives this reasoning; this package does not
revisit it.

## Reconsideration threshold

If a real two-tab bug ever ships that these tests cannot see — something about actual navigation
timing, cookie propagation delay, or a real `StorageEvent`'s shape this file's narrowed
`PersonaBroadcastEvent` interface does not capture — add a Playwright two-page spec at that point,
against the concrete failure, rather than building one now against a hypothetical one.

## Consequences

- `cross-tab-sync.ts` is now the one file that knows both halves of "a persona change invalidates
  the cache" — same-tab (`invalidateOnPersonaChange`, moved here from `hooks.ts` verbatim) and
  cross-tab (`broadcastPersonaChange`, `installCrossTabPersonaSync`) — rather than splitting the
  same concern across two files that would need to stay in sync by convention.
- `App.tsx` gains a second module-load side effect (`installCrossTabPersonaSync(queryClient)`)
  alongside `installSessionGuard`, with the same "wired once, not inside a component body" comment
  extended to cover both.
- **Amendment, same day, found before the next commit landed:** `invalidateOnPersonaChange` and
  `installCrossTabPersonaSync` both invalidate _every_ query, by design (`hooks.ts`'s own comment,
  quoted above, on why there is no per-feature key list) — and `CraGridBody`
  (`features/cra/components/cra-grid-screen.tsx`) had, until this same day, resynced its whole
  editable matrix from any new `data` reference on its query unconditionally, on the strength of
  ADR-0067's assumption that nothing but this grid's own save ever produced one. This package's
  own blanket sweep broke that assumption: a consultant with unsaved edits, a second tab, and a
  persona pick in that second tab would have had this tab's grid refetch and silently discard the
  edit — not a pre-existing gap package 11 was going to find, but a regression this ADR's own
  decision opened, caught by review before it reached a commit rather than after. Fixed the same
  day, in the same commit as this ADR: `features/cra/grid-resync.ts`'s `decideGridResync` (its own
  test file) is the one decision point that now tells `CraGridBody` to hold a conflicting
  reference instead of adopting it whenever the grid is dirty — package 11's own "preserve dirty
  state or present an explicit conflict when newer server data arrives," done here, first, because
  this ADR is what made it reachable. Package 11 itself still owns the same question for every
  other mutation's invalidation list (dashboard, history, economics) and any other screen that
  might hold unsaved state the same way.
- A tab reacting to another tab's broadcast has no way to distinguish a select from a clear (a
  `storage` event's `newValue` is a timestamp, not the mutation's own outcome) — deliberately: it
  reacts the same way either time (`refetchType: 'active'`, then whatever refetches under the new
  cookie succeeds or fails into the existing `session-guard.ts` handling), so there is no second
  branch to keep correct against a broadcast that cannot carry enough information to pick one.
