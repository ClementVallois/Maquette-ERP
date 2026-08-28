# ADR-0074 — The session guard hands its reason to the destination, not to the page it is destroying

- **Date**: 2026-08-28
- **Status**: accepted

## Context

`features/session/session-guard.ts` is the one place that handles "the session stopped resolving".
On `/problems/unknown-persona` — a stale or forged `erp_persona` cookie — it did three things in
order: `toast.error(...)`, purge the cookie, then `window.location.assign('/')`.

The third destroys the first. A hard navigation tears down the document, and the `<Toaster>` with
it. The toast was therefore visible only in the window between React flushing it to the DOM and one
localhost `DELETE` round-trip completing — which is not a behaviour, it is a bet on relative
latency. `apps/web/e2e/shell.spec.ts` asserted that toast and so inherited the bet.

The bet was lost in public. CI run `33152831346` (job `98788599568`) failed that assertion **three
times in one job** — the initial attempt and both `retries` — at one worker, twenty minutes after
the identical tree passed it in run `33152590075`. Reproduced locally against the served build at
**1 failure in 12** (`--repeat-each=12`). Holding the `DELETE` open for 500 ms with `page.route`,
to pin the observation window open, still failed **1 in 6**: the assertion could not be rescued
from the test side.

Two things this uncovered, neither of them about the test:

- **`session-guard.test.ts` never asserted the toast**, despite the word being in its own test
  name. The only mechanical proof that a visitor is ever told why lived in the racing e2e line.
- **ADR-0072 exists because of this same toast.** Its context section cites this exact test failing
  in the served topology — `sonner`'s injected stylesheet blocked by `style-src`, so the toast
  never rendered at all. The message has been the fragile part of this path twice.

`CLAUDE.md` lists error states as part of the deliverable rather than as polish. One visit in
twelve, a visitor whose session stopped resolving was thrown back to the persona selector with **no
explanation at all**.

## Decision

**The guard carries its reason in the URL and the destination renders it.**
`session-guard.ts` exports `SESSION_INVALIDATED_SEARCH = '?session=expired'`, redirects to
`/?session=expired`, and emits no toast; `routes/index.tsx` validates `session` as the literal
`'expired'` (`.catch(undefined)`, so a hand-typed value cannot put words on the demo's first
screen) and renders the existing `LABELS.shell.sessionInvalidatedToast` in an `Alert`.

The race is gone by construction rather than by timing: the message now lives on the page that
survives the navigation, so there is nothing for the navigation to destroy. `/problems/no-persona`
still redirects bare — nothing was invalidated, so there is nothing to explain.

## Rejected option

**Redirect client-side with `router.navigate({ to: '/' })`, keeping the toast.** This is the
one-line fix and it is wrong here, for a reason found by reading the code rather than by taste: the
hard reload is load-bearing twice. It is what resets this module's own `handled` latch — a
module-level `boolean` that, once `true`, silences the guard for the life of the document — and
what clears the still-warm `sessionQueryOptions` cache (30 s `staleTime`) that `_shell.tsx`'s
`beforeLoad` resolves from without a network call. A client-side navigate would land on the
selector holding a cache that still says the persona is valid, with the guard already latched off;
the next navigation into `_shell` would readmit the visitor to a shell whose cookie was purged, and
nothing would fire a second time. Keeping the toast would have cost the correctness of the purge.

Also rejected, and more tempting: **delete the racing assertion** and leave the defect recorded.
Green CI bought by removing the only test that ever caught this — the shape `BUILD-RULES.md` names
as "a green gate that stopped looking".

## Reconsideration threshold

If a second reason to bounce a visitor to the selector appears, `?session=expired` stops being one
literal and becomes an enumeration — at which point the query parameter is a small protocol and
deserves to be typed once next to the problem types it mirrors, rather than grown a value at a
time. Equally, if the guard ever stops hard-navigating (which would require solving the latch and
the cache first), the whole trade-off reopens and a toast becomes viable again.

## Consequences

**Easy.** The claim is now deterministic — `12/12` where the old assertion was `11/12` — and it is
asserted twice, at two levels that fail for different reasons: `session-guard.test.ts` proves the
reason is _carried_ (`expect(redirect).toHaveBeenCalledWith(SESSION_INVALIDATED_SEARCH)`, a gap
that existed since Phase 4), and `shell.spec.ts` proves it is _rendered_, after the redirect, on
the page a real visitor is looking at. The message also stops being a 4-second toast a visitor can
miss: it stays on screen until they choose a persona, which is what the sentence actually asks them
to do.

**Expensive.** The persona selector — "le premier écran de la démo : niveau de finition maximal" —
now has a conditional state, and one more reason to be looked at before the demo. `/` gains a
search schema it did not have. And **ADR-0072's cited example is now stale**: the test named in its
context no longer depends on `sonner` rendering. That does not reopen ADR-0072 — `style-src
'unsafe-inline'` is still required by Radix's `Tabs` and `ScrollArea`, which write style attributes
of their own, and `sonner` is still mounted and still used (the selector's own `selectError`). A
dated note in ADR-0072 says so rather than leaving a reader to re-derive it.
