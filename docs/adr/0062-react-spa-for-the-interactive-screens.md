# ADR-0062 — A React SPA for the interactive screens, Vue named down by name

- **Date**: 2026-08-24
- **Status**: accepted

## Context

ADR-0009 (17/08/2026) chose server-rendered HTML because the mockup then had four days of build
time and two enum files of domain code: whatever rendered had to be cheap enough not to eat the
invariants it displayed. Phase 6 built the four screens ADR-0009 named — and grew to seven, plus
the refusal page — on exactly that model, all shipped inside `apps/api/src/web/`.

ADR-0009 wrote its own reopening clause more precisely than most decisions in this repository get
one: "Reopen at roughly ten screens, or at the first genuinely interactive one — a Cra grid with
client-side series entry, a live staffing plan — where re-rendering the page per keystroke stops
being acceptable. At that point the honest choice is Vue on top of the existing API, not a
rewrite." `docs/frontend-plan.md` now specifies exactly that screen: a Cra entry grid with
client-side editing and totals current as of the last save, at a level of finish aimed at
impressing a CEO in a demo (`frontend-plan.md` §0). The threshold is reached on its own terms, by
the screen ADR-0009 named to reach it.

What the plan does not do is take the remedy ADR-0009 named. ADR-0009's rejected-option section
already ruled once between the two client frameworks — "Vue is the author's faster option of the
two and would have won if a client framework were needed at all" — and its reopening clause
repeats the same verdict for the case where one is. `docs/frontend-plan.md` §1 picks React
instead. That reversal, not the fact that a framework is coming, is what this ADR has to argue.

## Decision

**React 18+ with TypeScript (strict) is the client framework for every interactive screen, built
by Vite in a new workspace member, `apps/web`.** Routing (TanStack Router, file-based, named
exports — `import-x/no-default-export` stays enforced), data fetching and cache (TanStack Query),
tables (TanStack Table, headless) and forms (TanStack Form + zod, reusing the zod 4.4.3 already in
the repo) are the stack `frontend-plan.md` §1 pins; the UI kit is shadcn/ui components copied into
the repo, styled with Tailwind.

The two printable documents survive server-rendered, unmoved: `GET /facture/:id` and
`GET /releve/:id` keep rendering from `apps/api/src/web/`, through the same hand-written HTML tag
ADR-0025 built and the same escaping rules it enforces. This ADR narrows ADR-0009's scope to those
two documents (plus the pattern of a rendered refusal page, reused by the SPA's own error states);
it does not zero it out. `apps/web` opens them in a new tab rather than reimplementing them,
because nothing about them is interactive — they are read once, then printed.

## Rejected option

**Vue on top of the existing API — ADR-0009's own named remedy, and the serious alternative here,
not a straw man.** It is not rejected on ADR-0009's grounds; those already conceded Vue would win
a framework-only comparison, and a framework is now genuinely needed, so that comparison no longer
settles anything. It is rejected on a different axis, forced by the other stack choices this plan
makes in the same breath: shadcn/ui and TanStack Router/Table/Form are React-first libraries, and
their Vue ports trail the React originals in component coverage and feature completeness —
shadcn/ui's Vue port lags the theming and component surface of the original, and TanStack's Vue
adapters for Table and Form specifically are the least mature of the family (TanStack Query's Vue
adapter is solid and would not by itself have forced this choice). The plan's own stated bar is
not "a working UI" but "un niveau de finition produit réel, suffisant pour impressionner un
décideur" (`frontend-plan.md` §0) — a deliverable judged on finish. Spending the build against a
community port that is known to be less complete is exactly the wrong place to absorb that risk
when the goal is polish, not framework purity, and it is Vue's own faster-but-thinner-ecosystem
profile — true when ADR-0009 wrote it and still true now — that decides it.

**Stay server-rendered, with richer CSS.** ADR-0009 already answered this at the exact threshold
it wrote for itself: client-side entry with totals recomputed as the user edits does not happen by
re-rendering the page on the server per interaction. CSS has no mechanism to hold and mutate
client-side state between keystrokes without a network round trip per keystroke — the
"re-rendering the page per keystroke" ADR-0009 said would stop being acceptable is not a
stylistic limitation richer CSS relaxes; it is what a round trip per interaction literally is.

## Reconsideration threshold

Reopen only **before `apps/web` exists with real components** — i.e., before Phase 1 lands its
first commit. Once code depends on the React choice (routes, generated shadcn components, TanStack
integrations wired to the real API), a framework swap is the rewrite ADR-0009 already rejected
once, for the identical reason: a second, unverified boundary next to no gain. This decision is
not volumetric like most of this repository's thresholds; it is temporal, and it closes itself the
moment the first line of `apps/web/src` is committed.

## Consequences

**Easy.** shadcn/ui and TanStack give the plan a component and data layer that matches its stated
finish bar without hand-rolling a data table, a form validation layer, or a router — the thing four
server-rendered screens could do by hand and a CEO-grade SPA cannot. TanStack Query's cache and
invalidation model fits the real API directly; no mock layer (`MSW`, `@faker-js/faker`) is needed
because the seed and the endpoints already exist.

**Expensive.** `apps/web` is the first — and, by design, the only — part of this repository with
a front build step (Vite), so `pnpm run check` grows a new surface (`typecheck`, `boundaries`,
`test:cov` all now run against a second `src/`), and the dependency quarantine (7-day minimum,
`pnpm view <pkg> time`) now applies to a whole ecosystem of React-first packages at once. Nothing
in `apps/api`, `packages/timesheet`, or `packages/billing` changes; the cost is contained to the
new tier.
