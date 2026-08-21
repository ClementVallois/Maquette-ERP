# ADR-0043 — Margin is read at the composition root, because it belongs to neither module

- **Date**: 2026-08-19
- **Status**: accepted

## Context

`docs/BUILD-PLAN.md` § 5.3 requires that `Tjm`, `Cjm` and margin be served **only** by a dedicated
single-record read whose access is logged. ADR-0023's scope matrix already grants that read to
`manager` alone, and to their own office.

Writing it exposed a question nothing had answered: **whose rules read `Cjm`?**

- `Tjm` is a commercial term of a mission. It is `billing`'s projection, and ADR-0031 says so.
- `Cjm` is what a consultant costs the firm. **No invariant anywhere reads it.** It is not an input
  to a `Cra`, it is not an input to an invoice line, and no rule in either module refuses anything
  because of it. It exists in the dataset because it is the sensitive value the authorization model
  protects (`CLAUDE.md`, `CONTEXT.md`), not because anything computes with it.
- Margin needs both, plus the half-days that were worked — and `billing` may import nothing from
  `timesheet`.

ADR-0031's own reconsideration threshold is "the first **runtime** writer of reference data … or a
**third consumer module**". This is neither: nothing is written, and no third module appears. But
the threshold was written about a question this one is adjacent to, and answering by improvising a
join inside a route handler would be the implicit decision the ADR discipline exists to prevent.

## Decision

**The economics read lives in `apps/api`, at the composition root, and in neither module.**

It composes three things it does not own:

1. **The days** come from `timesheet`, through `CraRepository.findByConsultantAndPeriod` — the only
   question in this whole read that is genuinely a module's: who worked how much, on what.
2. **The rates** come from `public.mission_tjm` and `public.consultant_grades` — reference tables
   the seed is the single writer of (ADR-0031), read directly because they belong to no module's
   rules.
3. **The arithmetic** goes through `billing`'s exported `lineAmountCents`, which is the single call
   site allowed to divide and the one that asserts `tjmCents % 2 === 0` (BUILD-RULES § Money). The
   API adds integers and does nothing else with money.

**The guard is the kernel's, not a local one.** `assertMayRead(actor, 'economics', …)` runs
**before any rate is read**, so the refusal happens before the sensitive value is in memory, and it
is the same function both repositories call. There is no second authorization rule here.

**The disclosure is logged, and the log names fields rather than values.** `actor`, `role`,
`target`, `period` and the list of field **names** — `['cjmCents', 'tjmCents', 'marginCents']`. A
log line carrying the amount would be the leak the control exists to make expensive, and ADR-0024's
allowlist is what keeps it out.

**The control is the extra request, not secrecy.** These fields are already absent from every list
projection (ADR-0003). The asset is the aggregate, so what must be expensive is collecting eight
hundred records, not reading one: a round trip per consultant is half a second for a legitimate
reveal, prohibitive for a scrape, and the log is what makes a scrape attributable afterwards.

**The reads use `public.*` and nothing else.** Never `timesheet.*`, never `billing.*`. That is the
schema half of the boundary migration 001 made visible: the composition root assembles what each
module needs, and it reaches into no module's tables any more than it imports a module's internals.

## Rejected option

**A `billing`-owned economics projection.** The tempting one, because margin looks commercial and
`billing` already owns the `Tjm` side. It loses on what it would make `billing` responsible for: a
cost the module never bills on, arriving from a table it has no other reason to read, in a module
whose entire test suite is about the correctness of a document. It would also need the consultant
behind each line, which `billing.invoice_lines` does not carry — so it would mean widening the
event payload and the line to transport a cost figure that no invoice may ever print.

**A `timesheet`-owned projection.** Worse: it gives the module that records days a reason to know
what a day is sold for. `timesheet` publishes a fact and ignores who values it, which is the shape
ADR-0001 chose deliberately.

**A third `reference` module.** ADR-0031 rejected this shape once already, for reference data
generally. Creating it now for one read model would take the rejected option on a narrower case
than the one it was rejected for.

**A materialised margin column.** Faster, and it is what a real ERP does at volume. It is a cached
derivation of two dated references and a set of days, so it is wrong the moment any of the three
changes, and this dataset is nine consultants.

## Reconsideration threshold

Reopen the day a **rule** reads `Cjm` — a staffing constraint that refuses an assignment below a
margin floor, an alert on a mission running at a loss. At that point `Cjm` is a domain input rather
than a reported figure, and it belongs to the module holding the rule that reads it.

Reopen if a second read model appears at the composition root. One is a read model; three are a
layer, and a layer needs a home and a name rather than a directory that grew.

Reopen the direct `public.*` reads if any of those tables gains a **runtime** writer — that is
ADR-0031's own threshold, and it is the point at which "the seed is the single writer" stops being
what makes the duplication safe.

## Consequences

`Tjm`, `Cjm` and margin have exactly one route, one guard, and one log line. The claim "a manager in
one office cannot read the margin of a mission in another, and a test proves it" is now proved by
an integration test hitting the route, in both directions, plus a third asserting that a **billing**
persona is refused **in its own office** — which is the role dimension standing alone, with scope
holding constant.

The cost: `apps/api` now contains SQL, in three files. Two of them read `public.*` and nothing
else; the third writes, `INSERT INTO public.domain_events`, which ADR-0020 promised the composition
root would own and which `eslint.config.js` permits by naming the file. It is a persistence layer
in the application tier, and a reader is entitled to notice. The alternative was putting a cost figure inside a billing module, and that is
worse for a reason that would have been much harder to see later.
