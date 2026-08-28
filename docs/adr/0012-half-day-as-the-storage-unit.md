# ADR-0012 — The half-day is the single storage unit for recorded time

- **Date**: 2026-08-18
- **Status**: superseded by ADR-0069

## Context

A consulting firm sells days. It also sells halves of them: a consultant splits a day between two
missions, takes an afternoon of leave, or is staffed at 50 % on a mission for a month. Whatever
unit the Cra records in, that unit is multiplied by a `Tjm` to produce a line of an invoice, so it
is not a display concern — it is the quantity in a monetary computation.

ADR-0002 fixed money as integer cents with no wrapper type, and the exactness of that arithmetic
depends on what multiplies it. A quantity of `0.5` days reintroduces a float on the one side of the
multiplication that ADR-0002 did not cover.

## Decision

Recorded time is an **integer count of half-days**, everywhere: in the domain, in the event
payload that crosses the module boundary, in the database, and on the wire. A full day is `2`.
There is no other unit.

A `CraLine` therefore carries `1` or `2` half-days and nothing else — a line of zero records
nothing, a line of three is a day that does not exist. The `halfDays` factory refuses a fraction,
a negative count and `NaN`; the line refuses anything outside one or two.

Billing consumes the same integer: a line is `halfDays * tjmCents / 2`, multiply first and divide
last, and the division is exact because a `Tjm` is a whole number of euros and its cents are
therefore even (ADR-0002, enforced by the `Tjm` factory).

## Rejected option

**Days as a decimal — `0.5`, `1`, `1.5`.** The unit users say out loud, and the one every
spreadsheet in the firm already uses. It loses because it is a float multiplying money: `0.1 + 0.2`
arithmetic on quantities produces the one-cent discrepancies that accounting reports, and no
amount of care at the multiplication site removes the representation problem. The half-day integer
carries exactly the same information — the two are isomorphic — with none of the representation.

**Hours.** The general unit, and the one an ERP with time tracking would pick. It loses on two
counts here: converting hours to a billable day is a _policy_ (7 h? 7,5 h? 8 h?) that differs by
client and by contract, so storing hours would mean storing that policy too; and régie is sold in
days, so hours would be converted back at every invoice. Storing a derived unit and recomputing the
contractual one is the wrong direction.

**Storing both** — a half-day count for billing and hours for internal analytics. Rejected as two
sources for one fact, which is a divergence with a date on it.

## Reconsideration threshold

Reopen the day the firm bills something **by the hour** rather than by the day: SOC _astreinte_,
an incident-response retainer, or a client whose contract is written in hours. At that point the
quantity is genuinely not a half-day, and the answer is a unit on the line — not a float count of
days.

Also reopen if quarter-days appear in real usage. The current model would need `quarterDays`, and
the `Tjm` premise changes with it: exactness would then require a rate divisible by four.

## Consequences

Every quantity in the chain is an integer, from the consultant's entry to the invoice line, and the
one division allowed on money has a precondition that is guaranteed rather than checked at runtime
and hoped for.

The screens have to translate: a consultant thinks "half a day", the model says `1`. That
translation is one function at the edge, and it is a cheaper place for the ambiguity than the
storage layer.

`smallint` is enough in Postgres (Phase 3), and a sum over a month is exact by construction — no
rounding, no accumulation error, no `numeric` needed on the quantity side at all.
