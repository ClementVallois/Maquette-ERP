# ADR-0037 — Only `Regie` days become lines, and the days that do not are reported

- **Date**: 2026-08-18
- **Status**: accepted

## Context

The event `billing` reacts to carries a per-mission breakdown of a validated month: a list of
`(missionId, halfDays)`. It carries **no billing model** — and it should not, because the billing
model is a commercial term, and `timesheet` holds staffing while `billing` holds commerce
(ADR-0031). Only `billing` can tell whether a mission is `Regie` or `Forfait`.

So a validated `Cra` can perfectly well contain days worked on a `Forfait` mission. The dataset
`CLAUDE.md` prescribes guarantees it: fixed-price missions are in the seed precisely so that a
reader can see they exist and are not invoiced here.

The obvious implementation is `continue`. It is also the one that produces an ERP nobody trusts:
half-days that were recorded, validated and then silently absent from every document, with nothing
anywhere saying they were considered. A reader looking at 42 validated half-days and an invoice for
20 has no way to tell whether the other 22 were deliberately excluded or lost by a bug.

The related case has the same shape and no obvious answer either: a month worked **entirely** on
`Forfait` missions. There is nothing to bill, and `Invoice.draft` already refuses a document with no
line — correctly, because an empty invoice is not a document.

## Decision

**Only days on a `Regie` mission become invoice lines.** Everything else is **declined, not
skipped**: drafting returns `{ invoices, declined }`, and every half-day the event carried is in
exactly one of the two. A declined entry names the mission, the count and a typed reason —
`notRegie`, `unknownMission`, `noAgreedRate`, `unknownClient`.

**A month with no billable day drafts no invoice**, and the result says so: an empty `invoices` list
and a populated `declined` list. That is a legible answer rather than a null, and it is what makes
"no invoice" distinguishable from "drafting did not run".

The three reasons beyond `notRegie` are in the same list on purpose. A mission the commercial
projection does not hold, a mission with no rate agreed on that date, and a client that has been
deleted are all **reference-data faults** rather than business outcomes — and each of them is a
silent lost day if it is treated as an exception to swallow. Naming them makes the seed's job
checkable: ADR-0031 makes the seed the single writer of both projections, and a `declined` entry
with any of those three reasons means the seed wrote one side and not the other.

## Rejected option

**Skip a non-`Regie` mission silently.** Two lines shorter and the invoice comes out identical. It
loses on the only thing this build is arguing: that its claims are checkable. A day that disappears
between validation and invoicing with no trace is the reconciliation problem the README's opening
paragraph describes — "chaque ressaisie est une source d'écart entre ce qui a été produit et ce qui
est facturé" — reintroduced by the tool that exists to remove it.

**Refuse the whole month when it contains a non-`Regie` day.** Loud, and it satisfies "no silent
loss". It loses because it is wrong about the business: a consultant splitting a month between a
`Regie` audit and a `Forfait` remediation is ordinary, and refusing to bill the audit days because
the remediation days are not billable here punishes reality for the mockup's scope.

**Draft an empty invoice for a fully-`Forfait` month**, with zero lines and a zero total. It loses
on the domain rule already written: an invoice with no line is refused, because nothing is owed and
nothing says what for. Weakening that rule to make a caller's life easier is the inversion this
repository forbids.

**Put the billing model in the event payload** so `timesheet` filters before publishing. It is the
implementation that avoids the question entirely, and it loses on the boundary: the billing model is
`billing`'s to know (ADR-0031), and a payload carrying it would make `timesheet` responsible for a
commercial term it has no business holding. The event describes what was worked, not what is
billable — and the fact that those are different is exactly what the two modules are for.

## Reconsideration threshold

Reopen when a second billing model is **built** rather than merely present in the dataset. At that
point `notRegie` stops being a decline reason and becomes a routing decision — the days go to a
different line origin (ADR-0013's variant), not to a rejection list — and the shape of this result
changes with it.

Reopen the `declined` list itself if it grows a consumer that needs to act on it rather than read
it: a screen showing "22 half-days not billed this month" is a read, but a retry queue is a
workflow, and this build does not have one.

## Consequences

Every half-day in the event is accounted for, in one list or the other. The screen of Phase 6 can
show a manager what was and was not billed from the month they validated, and the answer comes from
the domain rather than from a diff of two numbers.

The cost is a return type with two fields where a caller usually wants one, and a caller that
ignores `declined` gets today's silent behaviour back. That is real, and it is why the drafting
result is a single object rather than an array with a side channel: ignoring the second field takes
a deliberate `.invoices`, which is visible in review.
