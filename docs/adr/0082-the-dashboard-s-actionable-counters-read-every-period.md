# ADR-0082 — The dashboard's actionable counters read every period, not the requested one

- **Date**: 2026-09-01
- **Status**: accepted

## Context

`GET /api/v1/dashboard` (ADR-0073) takes an optional `?period=`, defaulting to the wall-clock
`currentPeriod()`. Every figure on the response was computed against that **one** period:

- Manager `pendingDecisions` came from `preFacturierComposition`'s `cras` for `requestedPeriod`
  alone, counting `status === 'submitted'` rows.
- Manager `lateCras` filtered the same single-period rows by `composition.periodClosed`, a flag
  that is true only when the _requested_ period's last day is already past — which the default
  period, "now", never is by construction. On the screen a manager actually lands on, `lateCras`
  could never read anything but zero.
- Consultant `myMonthStatus` came from `findByConsultantAndPeriod(actor.consultantId, period,
actor)` — one Cra, one period.

The brief's own repro: a consultant submits a Cra on Friday 31/08. Their manager opens the
dashboard the following Monday — already September, the new default period — and the submission
that has been waiting all weekend is invisible: `pendingDecisions` reads `0`. The symmetric case
for a consultant: a Cra refused in August stops showing `refused` the moment the default period
rolls to September, even though nothing about the refusal itself is resolved.

**The rule this ADR fixes the reads to satisfy: a Cra in an actionable state — `submitted`
(awaiting a manager's decision) or `refused` (awaiting the consultant's correction) — is counted,
or listed, regardless of which period it belongs to.** A Cra whose period has closed without
reaching `validated` is `late` by the same reasoning (ADR-0054), independent of which period the
dashboard happens to be showing. `billableCents` (manager) and `recordedQuarterDays`/
`remainingWorkableDays` (consultant) are **not** actionable-state figures — they are genuinely
about one specific month's activity — and stay scoped to `requestedPeriod` exactly as before.

## Decision

**`pendingDecisions` and `lateCras` (manager), and a new `refusedPeriods` field (consultant), are
read with `unit.cras.list({ actor, statuses: […], limit: CRA_LIST_MAX_PAGE_SIZE, offset: 0 })` —
no `period` filter.** `CraListQuery.period`'s own contract is "one period, or every one"; omitting
it resolves to every one the actor may see, scoped by the repository exactly as
`GET /api/v1/cras` already scopes it (office for a manager, own id for a consultant — ADR-0003),
and capped at the same fixed `CRA_LIST_MAX_PAGE_SIZE = 200` ADR-0081 already established for this
identical repository call. `lateCras` narrows that same read to rows whose period has closed
(`lastDayOf(periodFromIso(row.period)) < today`); `pendingDecisions` narrows it to `submitted`;
`refusedPeriods` (consultant) narrows a same-shaped read to `refused` and returns the bare list of
periods, letting the screen decide how to render it relative to the period already on display.

`period` stays on every response and still governs the figures that are genuinely about one
month — `billableCents`, `recordedQuarterDays`, `remainingWorkableDays`, and `myMonthStatus`
itself (the status of _that_ month specifically, which `refusedPeriods` supplements rather than
replaces).

## Rejected option

**Widen `/api/v1/pre-facturier` (or `preFacturierComposition`) to answer "every period" instead of
adding a second, dashboard-local read.** Rejected: `CONTEXT.md`'s own definition of the
_pré-facturier_ is "the screen that answers, for one `Period` and one `Office`, what is billable" —
bending its composition to also answer "every period" contradicts the one thing its name commits
to, and duplicates paging/scope logic `GET /api/v1/cras` (and `CraRepository.list`) already own.
The dashboard route's own header already states its method — "every field computed from a
repository this file already calls elsewhere, none invented for this route" — and `cras.list` is
exactly such a call, already used by this same file for item 7's filters.

**Fetch every non-validated Cra unconditionally and derive both `pendingDecisions` and `lateCras`
from one list.** Considered and mostly adopted — the two counters do share one read (see
Consequences) — but rejected as the _only_ read for the manager branch: `billableCents` still
needs `preFacturierComposition` for the requested period specifically, so the branch keeps both
reads rather than trying to derive a period-scoped money figure from a cross-period status list.

## Reconsideration threshold

The same one ADR-0081 already names for this exact call: **the day a single office's non-validated
Cra count is measured past 200**, the fixed cap silently truncates `pendingDecisions`/`lateCras`
(a manager who really has 210 pending items reads 200), and the exact-count design ADR-0081
rejected for the same reason becomes the one to build — for both routes together, not one at a
time.

## Consequences

**Easy.** One extra `cras.list` call per manager/consultant dashboard read, inside the same
transaction as the read already there; no migration, no new route, no change to `CraListQuery`
(the two fields this needed — `period` omissible, `statuses` — already existed for item 7, QA
round 1). `pendingDecisions`, `lateCras` and `refusedPeriods` no longer disagree with reality
merely because the calendar turned a page.

**Not solved by this ADR**: the manager card's "Ouvrir le pré-facturier" button still opens the
_requested_ period specifically (default: now) — a manager whose pending items sit in a different
month has to reach them through pré-facturier's own month picker, which is `docs/open-questions.md`
row dated 31/08/2026 for a related, already-open reason (that picker's own page cap can omit an
old period for a large office). This ADR makes the dashboard's own count honest; it does not build
a cross-period queue screen, and does not claim to.
