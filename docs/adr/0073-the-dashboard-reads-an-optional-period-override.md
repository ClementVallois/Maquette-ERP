# ADR-0073 — `/tableau-de-bord` accepts an optional `?period=` override

- **Date**: 2026-08-27
- **Status**: accepted

## Context

Task 8.4 built `/tableau-de-bord` to read `period` from the wall clock alone
(`lib/period.ts`'s `currentPeriod()`), with no search parameter and no picker — its own comment
said so explicitly: "the period is always the wall-clock 'now' … there is no picker on this
screen, and none of Annexe A's other periods … is what 'the dashboard, right now' means for a
first-time visitor." That was a real decision, made in Phase 8, and it was never written down as
one.

The seed is frozen at `2026-06` (ADR-0022, for the deterministic `SEED_TIMESTAMP_MS` guarantee).
A wall-clock-only dashboard therefore answers empty for every role but the consultant's on any
date after June 2026 — which, since the seed does not move, is every date this mockup will ever
be opened on. Confirmed live rather than assumed: `GET /api/v1/dashboard?period=2026-08` (the
date this ADR is written) answers `pendingDecisions: 0`; `?period=2026-06` answers `1`, the seed's
real, seeded state (`docs/open-questions.md`, row dated 27/08/2026).

Task 10.4 made this unavoidable rather than merely regrettable: `docs/demo-checklist.md` is
"also the final Playwright spec" (`docs/frontend-plan.md`, Phase 10 § 10.4), and its own text
describes Bruno's dashboard reading "en attente". A spec whose central assertion depends on the
calendar date it happens to run on is not a spec — it passes today and silently stops meaning
anything the day the wall clock crosses into a month the seed has no data for, which by
construction is already true.

## Decision

**`/tableau-de-bord` accepts an optional `?period=` search parameter** (`z.string().regex(...)`,
the identical shape `routes/_shell/pre-facturier.tsx` already uses for its own `?period=`),
**defaulting to `currentPeriod()` when absent.** A bare visit — the persona selector's own
redirect target, and every organic click on the "Tableau de bord" nav entry — is still exactly the
wall-clock "now" Phase 8's original design intended. Nothing in the rendered page changes: no
picker, no visible control, no way for a visitor to discover the parameter by looking at the
screen. `journeys.spec.ts`'s J2 is the one caller that pins it, at `?period=2026-06`, to assert
Bruno's dashboard actually reads "1" pending decision before he acts on it.

## Rejected option

**Move the seed to the wall-clock month instead**, so a bare `currentPeriod()` always has data.
Rejected: it spends `SEED_TIMESTAMP_MS` and `seed-fingerprint.ts`'s determinism guarantee (ADR-0022)
on a problem the URL already solves without touching the seed at all, and it would make every
other date-pinned assertion in this repository (Alice's validated June Cra, the Réunion mission's
8.5% VAT client, the `SEC-2026-000001` first invoice number) move with it for no reason connected
to any of them.

**Accept an empty first screen and say so in the demo script.** Honest, and weak: task 8.4's own
stated goal is "the first screen after the persona selector, polish maximal", and an empty
dashboard on the literal first thing a CEO sees undercuts exactly the impression that screen
exists to make. Also self-defeating for task 10.4's own purpose — a checklist step that says
"the dashboard is empty, and that's fine" is not proving anything a reviewer could not already
guess from reading the seed.

## Reconsideration threshold

If a future phase gives the dashboard a second period-varying figure that must always match "right
now" specifically — a live countdown, a value meaningfully different hour to hour — the override
becomes a way to lie about what "right now" means, and the parameter should be removed or paired
with a visible "as of" indicator instead of staying silent.

## Consequences

The dashboard is reproducible in `journeys.spec.ts` regardless of the date the suite runs on,
`axe.spec.ts`'s three dashboard tests keep reading the true wall clock (deliberately — task 10.2's
own accessibility pass is about the organic screen, not the demo-pinned one), and the coupling
this creates is the same one `pre-facturier.tsx` already lives with: a route whose URL can say
something its own UI never offers a control for, discoverable only by reading the route file or
this ADR.
