# ADR-0098 — The manager dashboard's chart becomes a staffing snapshot; billing's is a stated absence

- **Date**: 2026-09-04
- **Status**: accepted

## Context

Item 3, QA round 5: the invoice-history charts (`InvoiceHistoryChart`, Rank A2) render on both the
manager and billing dashboards today. The reporter's own words: keep the component (`ne supprime
pas ceux-là, garde-les de côté`), but it answers the wrong question for a manager — a manager's
first question on this screen is about their own people, not the office's invoice history, which
the pré-facturier and the invoice list already answer. Billing keeps nothing here for now, on the
explicit instruction, rather than either chart family.

This forced three real decisions:

1. **What replaces the manager's chart.** The brief's own example — "how many consultants are on a
   mission versus in `Intercontrat`" — needs a real repository read, scoped by office, not a count
   assembled client-side from a partial list (the reporter's own constraint).
2. **How to tell "on a mission" from "in `Intercontrat`" at all.** Nothing in `packages/timesheet`,
   `packages/billing` or `apps/api` reads the literal string `'Intercontrat'` today — checked, not
   assumed, by a repository-wide search that returned zero matches outside the seed and the
   labels. `CONTEXT.md`'s own `Intercontrat` entry licenses exactly this: "modelled as an internal
   `Forfait` mission **named** `Intercontrat`" (ADR-0046). The name is not a fixture convenience;
   it is the model, so this ADR is the first thing to depend on it outside the seed.
3. **What time basis the new figure uses.** Every other manager figure on this dashboard is either
   scoped to the requested `period` (`billableCents`) or read across every period the actor may see
   (`pendingDecisions`, `lateCras` — ADR-0082). Staffing is neither: who is on a mission right now
   is an operational fact, not a monthly one, and reading it against the _requested_ period would
   need a "staffing as of a past date" query nothing in this schema currently supports (an
   assignment has no audit history; only its current row is a fact the database can answer).

## Decision

**`managerStaffingSnapshot(client, officeId, today)`** (`apps/api/src/staffing/staffing-snapshot.ts`)
counts each of the office's current, non-departed consultants into exactly one of two buckets: read
today's active assignments (`from_date <= today <= to_date or to_date IS NULL`), and a consultant
counts as `onMission` if **any** active assignment's mission is not named exactly `Intercontrat`,
else `intercontrat`. Scoped by `office_id` at the query itself, the same way `consultantsOfOffice`
already is. **`today`, not the requested `period`** — the new `ManagerStaffing` field on the
dashboard payload is deliberately outside `period`'s scope, and the panel's own caption says so in
words ("Aujourd'hui, pas la période affichée ci-dessus"), so the screen does not silently disagree
with its own heading.

**The manager dashboard renders a new `ManagerStaffingPanel`** (a two-segment bar, `onMission`
versus `intercontrat`, with a legend and an `<svg title>` so colour is never the only carrier)
instead of `InvoiceHistoryChart`. **Billing renders `BillingChartsPlaceholder`**, a stated "no chart
for this role yet" — an empty state, not a blank gap. **`InvoiceHistoryChart` (and the two chart
functions inside it), `useInvoiceHistory`, and the API route behind it are untouched and stay in
the repository** — nothing calls them from any screen any more, on the reporter's own instruction
to keep them aside rather than delete them; `HistorySection`, the dashboard-local wrapper that used
to render `InvoiceHistoryChart` for both roles, is deleted, because unlike the exported chart
component itself it was dead code the moment nothing called it, and this repository does not keep
unreferenced local functions around as a courtesy.

## Rejected option

**Match on `billing_model = 'Forfait'` instead of the mission name.** Rejected on the domain's own
terms: `Forfait` is a real, billable contract type this mockup's seed already carries alongside
`Intercontrat` (both are `Forfait`, by ADR-0046's own design — `Intercontrat` is _modelled as_ an
internal Forfait mission, not a distinct `BillingModel` value). Matching on `billing_model` would
count every genuine fixed-price client project as `Intercontrat`, which is exactly backwards. The
new test proves the distinction directly: a `Forfait` mission named anything other than
`Intercontrat` counts as `onMission`.

**Scope the figure to the requested `period` instead of `today`.** Rejected because nothing in this
schema can answer it: an `Assignment` row is the current fact, not a versioned history, so "who was
staffed in March" cannot be reconstructed from the table as it stands. Building that would be a
schema change nobody has asked for, to answer a question ("staffing as of a past month") the brief
never posed — the brief's own example is present tense ("comment de consultants sont en mission").

## Reconsideration threshold

**The day a manager needs staffing as of a period other than today** (a real request, not a
hypothetical) is the day `Assignment` needs a real history and this function needs a `period`
parameter to read against it — a schema change, not a query change, so it earns its own ADR when it
comes.

## Consequences

**Easy.** One new small SQL read, scoped and index-friendly (`assignments.consultant_id`,
`assignments.mission_id` are already indexed by migration 001); one new front-end panel; one new
localStorage key (`erp:dashboard-staffing-visible:*`, deliberately not reusing item 23's
`erp:dashboard-charts-visible:*` — reusing it would inherit a stale `'false'` from anyone who had
collapsed the old charts, hiding the new panel for them on day one). Two integration tests prove
the two things worth proving: the name discriminator (a non-`Intercontrat` `Forfait` mission still
counts as staffed) and the office scope (two offices, deliberately non-coincidental numbers on both
sides, so a leak in either direction would fail rather than pass by coincidence).

**Not solved by this ADR**: a consultant with a genuine data gap — no active assignment at all,
which `CONTEXT.md`'s own `Intercontrat` entry says should not exist ("no consultant with no
assignment") — is silently absent from both buckets rather than counted or flagged. The invariant
is asserted in `CONTEXT.md`, not re-checked here; this function trusts it the way
`assignmentCatalogue` already does.
