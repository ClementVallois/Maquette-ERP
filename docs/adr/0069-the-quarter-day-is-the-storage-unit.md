# ADR-0069 — The quarter-day replaces the half-day as the single storage unit

- **Date**: 2026-08-26
- **Status**: accepted

## Context

ADR-0012 made the half-day the single unit in which time is recorded, stored, transported and
billed. It also wrote down what would reopen it:

> Also reopen if quarter-days appear in real usage. The current model would need `quarterDays`, and
> the `Tjm` premise changes with it: exactness would then require a rate divisible by four.

They appeared. The firm's own timesheet tool records in quarters — `0,25`, `0,5`, `0,75`, `1` — and
a consultant routinely splits one day four ways: two missions, a training morning, an internal
meeting. Under the half-day, the third activity of a day has nowhere to go, and the model's answer
to "what did you actually do on Tuesday" is a rounded one. A mockup whose whole claim is that the
day recorded is the day invoiced cannot round the day.

This ADR therefore does what ADR-0012 said to do at this trigger, and nothing more: it changes the
unit, not the shape of the model around it.

**The premise ADR-0012 flagged is already satisfied**, which is why this is a small decision rather
than a new arithmetic problem. `packages/billing/src/domain/money.ts` divides once, at one call
site, and asserts its precondition there (`tjmCents % HALF_DAYS_PER_DAY !== 0` → refuse). A `Tjm` is
a whole number of euros, enforced by its own factory (ADR-0002), so `tjmCents` is a multiple of
`100`, and `100` is divisible by `4`. The divisor changes from `2` to `4` and the precondition holds
for exactly the same reason it held before — no rate becomes unbillable, no amount acquires a
decimal, and the check stays where it is rather than becoming a formality.

## Decision

Recorded time is an **integer count of quarter-days**, everywhere ADR-0012 put the half-day: in the
domain, in the event payload that crosses the module boundary, in the database, on the wire, and in
the invoice line. A full day is `4`. There is no other unit.

- `packages/platform/src/quarter-days.ts` replaces `half-days.ts`: `QuarterDays`,
  `QUARTER_DAYS_PER_DAY = 4`, and a `quarterDays` factory that refuses a fraction, a negative count
  and `NaN`.
- A `CraLine` carries `1` to `4` quarter-days. The bound is the day itself, and the line refuses
  anything outside it.
- The two invariants that make a quantity safe are already explicit and stay where they are: the
  aggregate refuses a day that exceeds one full day (`Cra.recordDay` → `DayOverbookedError`,
  against `QUARTER_DAYS_PER_DAY`) and submission refuses a workable day that adds up to less
  (`assertMonthAddsUp` → `IncompleteCraError`). Both were written against the constant, not against
  the number `2`, so they become quarter-day rules by changing the constant they already read.
- Billing consumes the same integer: a line is `quantity * tjmCents / 4`, multiply first and divide
  last, precondition asserted at the one division site. `InvoiceLine.quantityQuarterDays` is a count
  of quarter-days and `unitPriceCents` is the price of one quarter-day — the unit recorded is the
  unit transported is the unit billed, unchanged from ADR-0012 except in which unit it is.
- In Postgres, `timesheet.cra_lines.quarter_days`, `billing.invoice_lines.quantity_quarter_days` /
  `origin_quarter_days`, `billing.declined_days.quarter_days`, each with its `CHECK` rewritten to
  the new bound. The rename is a **new numbered migration** (`011`), not an edit of `002`/`003`:
  the migration log is the history of the schema, and a schema that changed its mind says so.
- The screens keep translating, and the translation stays one function at the edge (`frenchDays`):
  a consultant thinks "un quart de journée", the model says `1`.

**No data migration.** The seed is deterministic and the database is reset from it (ADR-0022), so
there is no historical row whose meaning would silently double. This is the one moment where that
decision pays for itself, and it will not come back: the day this mockup carries data somebody
cares about, a unit change stops being a rename and becomes a data migration with a backup.

## Rejected option

**Keep the half-day, and let the grid offer quarters anyway**, converting at the edge. It is the
cheap answer — no domain change, no migration, the screen does the arithmetic. It loses because a
quarter is not representable in half-days: the conversion is lossy in the one direction that
matters (`0,25 + 0,25 + 0,5` becomes `1` and the two missions that shared the morning are gone),
and a lossy conversion at the edge of a chain whose claim is "the day recorded is the day invoiced"
is the discrepancy this repository exists to remove. It would also put a business rule in a React
component, which `CLAUDE.md` rule 5 forbids outright.

**Do nothing — refuse the quarter, and say the half-day is the model.** Defensible right up until
the demo, where the reader records a real day and finds the tool cannot express it. It also wastes
the thing that makes this repository worth reading: a threshold written in advance, fired by real
usage, is only evidence of anything if it is honoured when it fires.

**Days as a decimal — `0,25`, `0,5`, `1`.** Rejected again, for ADR-0012's reason exactly: it is a
float multiplying money. Nothing about quarters weakens that argument; if anything a quantity of
`0.25` in binary floating point is the textbook example, and the integer quarter carries identical
information with none of the representation.

**Hours.** Rejected again, unchanged: converting hours to a billable day is a policy that differs
by client and contract, and régie is sold in days. Quarters do not move that line — a quarter-day
is still a fraction of the contractual unit, not a duration.

## Reconsideration threshold

Unchanged from ADR-0012, and inherited deliberately: reopen the day the firm bills something **by
the hour** — SOC astreinte, an incident-response retainer, a contract written in hours. At that
point the quantity is genuinely not a fraction of a day, and the answer is a unit on the line, not
a finer division of the day.

One threshold is added, because this decision creates it: reopen if a `Tjm` that is **not** a whole
number of euros is ever agreed. The exactness of `quantity * tjmCents / 4` rests on `tjmCents`
being a multiple of `100`; a rate of `487,50 €` breaks the precondition the division asserts, and
the answer is then a rounding policy on the line — a decision, not a patch.

Finer than a quarter — a tenth of a day, an eighth — is **not** a reopening: it is the same
argument again, and the reason to draw the line here is that a quarter is what a human records and
what the firm's own tools offer. Below that, people report duration, and duration is the hour
threshold above.

## Consequences

**Easy.** The change is a rename plus one constant plus one divisor. Every rule that had to move
was already written against a named constant rather than against a literal `2`, which is what
ADR-0012's own "never `* 2` or `/ 2` bare in a rule" bought: the two per-day invariants and the
money division become quarter-day rules without their logic being touched.

The entry grid can finally show what a day is: four slots' worth of quantity, several missions,
and a per-day total the consultant can read — which is what ADR-0070 builds on.

**Expensive.** Roughly ninety files carry the word, most of them tests, and every one of them has
to be read rather than sed-ed: a test asserting `halfDays: 2` for "a full day" is right in intent
and wrong in value, and a blind rename would leave it green and meaningless. `MAX_ENTRIES` on
`PUT /api/v1/cras/:period/entries` doubles from `62` to `124` for the same reason it was `62`.

The README's "Ce que je ne construis pas" loses a row: "plus de deux missions dans une même
journée" was a scope refusal justified by ADR-0012, and it is now built. A refusal whose premise
moved is not quietly deleted — it is replaced by what took its place.
