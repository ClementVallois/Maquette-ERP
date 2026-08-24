# ADR-0062 — A React SPA for the interactive screens

- **Date**: 2026-08-24
- **Status**: accepted

## Context

ADR-0009 (17/08/2026) chose server-rendered HTML because the mockup then had four days of build
time and two enum files of domain code: whatever rendered had to be cheap enough not to eat the
invariants it displayed. BUILD-PLAN's Phase 6 built the four screens ADR-0009 named — and grew to
seven, plus the refusal page — on exactly that model, all shipped inside `apps/api/src/web/`.

> Two plans number their phases in this repository, and this ADR cites both. **BUILD-PLAN Phase N**
> is `docs/BUILD-PLAN.md`, the build that produced the domain, the API and the server-rendered
> screens. **Front-end plan Phase N** is `docs/frontend-plan.md`, the rebuild this ADR opens. They
> are unrelated sequences.

ADR-0009 wrote its own reopening clause more precisely than most decisions in this repository get
one: "Reopen at roughly ten screens, or at the first genuinely interactive one — a Cra grid with
client-side series entry, a live staffing plan — where re-rendering the page per keystroke stops
being acceptable. At that point the honest choice is Vue on top of the existing API, not a
rewrite." `docs/frontend-plan.md` now specifies exactly that screen: a Cra entry grid whose two
slots per day are edited client-side and whose totals are recomputed **as the user edits**, then
reconciled at save (front-end plan §6.2). That is the case ADR-0050 had to narrow away — it wrote
"current as of the last save" precisely because ADR-0049 forbade the script that would do better —
and it is what a round trip per keystroke cannot serve. The threshold is reached on its own terms,
by the screen ADR-0009 named to reach it.

What the plan does not do is take the remedy ADR-0009 named. ADR-0009's rejected-option section
already ruled once between the two client frameworks — "Vue is the author's faster option of the
two and would have won if a client framework were needed at all" — and its reopening clause
repeats the same verdict for the case where one is. `docs/frontend-plan.md` §1 picks React
instead. That reversal, not the fact that a framework is coming, is what this ADR has to argue.

## Decision

**React with TypeScript (strict) is the client framework for every interactive screen, built
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
not a straw man.** It is not rejected on ADR-0009's grounds: those conceded Vue would win a
framework-only comparison, and a framework is now genuinely needed, so that concession no longer
settles anything. It is rejected on the kit, and only on the kit.

`docs/frontend-plan.md` §1 justifies its React column with one blanket sentence — shadcn/ui and
TanStack are "React-first", the "portages Vue/Svelte moins complets". **Checked against the
registry on 24/08/2026, that sentence is too broad, and half of it does not hold**: TanStack ships
first-class Vue adapters, released in lockstep with the React ones — `@tanstack/vue-router`
1.170.29 against `@tanstack/react-router` 1.170.32, and `@tanstack/vue-form` 1.33.5 against
`@tanstack/react-form` 1.33.5, the same version. Routing, data, tables and forms are **not** an
argument for React here, and this ADR does not pretend they are.

What does hold is the UI kit. shadcn/ui is published from `shadcn-ui/ui`, the upstream project;
`shadcn-vue` is published from `unovue/shadcn-vue` by a different maintainer — a port that tracks
upstream rather than the thing being tracked. That distinction is usually a minor risk on an npm
dependency, and it is not minor here, because **shadcn's model is to copy component source into
the repository**: every one of those components becomes this repository's own code, read by
whoever reviews it and maintained by whoever owns it. Taking source from the port means taking a
second project's interpretation of an upstream that keeps moving, into a repository whose whole
argument is that it can account for what it contains. The kit is also the piece that produces the
one thing the deliverable is judged on — `frontend-plan.md` §0 sets the bar at "un niveau de
finition produit réel, suffisant pour impressionner un décideur" — so it is the wrong place to
absorb the risk.

One argument short of the plan's, then, and enough: the kit decides it, the rest is a tie.

**Stay server-rendered, with richer CSS.** ADR-0009 already answered this at the exact threshold
it wrote for itself: client-side entry with totals recomputed as the user edits does not happen by
re-rendering the page on the server per interaction. CSS has no mechanism to hold and mutate
client-side state between keystrokes without a network round trip per keystroke — the
"re-rendering the page per keystroke" ADR-0009 said would stop being acceptable is not a
stylistic limitation richer CSS relaxes; it is what a round trip per interaction literally is.

## Reconsideration threshold

**Reopen if shadcn/ui leaves the stack.** The kit is the whole of the reason React won — the
paragraph above concedes the rest is a tie — so a build that drops it, for a headless kit with
equal footing on both frameworks or for hand-written components, has no argument left for either
framework and owes the comparison again. The same applies from the other side: if the copied
components stop coming from upstream (the port merges into it, or upstream stops moving), the
distinction this ADR rests on has dissolved.

Not reopened by preference once `apps/web/src` holds real components. A framework swap then is the
rewrite ADR-0009 rejected once already, and the reason has not changed: the cost is paid in code
that works, for a boundary nothing verifies.

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
