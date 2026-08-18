# ADR-0013 — The invoice line carries its origin, though only `Regie` exists

- **Date**: 2026-08-18
- **Status**: accepted

## Context

This mockup invoices one billing model. `Regie` is the only model whose days become lines, and
`Forfait` is in the dataset precisely so that the reader can see it is not billed here (README,
"Ce que je ne construis pas"). Every line this build will ever produce comes from validated days of
a `Cra`.

The honest YAGNI answer is therefore a flat line: a designation, a quantity, a unit price, an
amount, a rate. Nothing else is used. This repository claims YAGNI as its sorting criterion and
applies it against itself elsewhere — no `Money` wrapper, no port with one implementation, no
workflow engine.

The argument against is not "we might need it later". It is that this particular shape is the one
that retrofits worst, and the cost of retrofitting it is not paid where the change is made. A
consulting firm's real line inventory is short and heterogeneous: days of `Regie`, a milestone of a
`Forfait`, an expense rebilled at cost, a unit of a run contract, a discount. Each carries different
fields, and none of them fits "quantity × unit price" the same way.

The moment a second origin appears, a flat line has to answer where its extra fields live. The
answers available at that point are all bad: nullable columns that mean something for one kind of
line and nothing for the others; a JSON blob that no query can read; or a migration over documents
that are legally immutable — an issued invoice is never modified, so a schema change has to carry
every historical line forward with an origin invented after the fact.

## Decision

An `InvoiceLine` carries an **`origin`**, a tagged union with one variant today: `RegieDays`. It
holds the mission, the `Cra` the days came from, the month worked, the count of half-days, and the
daily rate that applied.

A second origin is a new variant of that union, and the type checker names every place that has to
handle it — `switch` exhaustiveness is already an error in this repository. Nothing about the
existing lines changes, and nothing about the documents already issued has to.

The origin is also what makes the audit trail real. `CLAUDE.md` claims the CRA → line → invoice
chain **as** the _piste d'audit fiable_; the link that makes that claim checkable is `origin.craId`
on the line itself, not a join reconstructed later from dates and amounts.

## Rejected option

**A flat line, with the polymorphism added when a second model is built.** The literal YAGNI answer,
and it is the option a reviewer will propose. It loses on cost asymmetry rather than on principle:
one tagged union today costs a type and a `kind` field, while the same union introduced after the
first document is issued costs a migration over immutable records plus every read that assumed the
flat shape. YAGNI sorts by _expected_ cost, and here the two are not comparable.

**Storing the origin as free JSON on the line.** Cheaper still, and it makes the retrofit look free
— any origin fits. It loses because nothing can query it, nothing type-checks it, and the fields
that decide an amount would be the only ones in the domain no schema describes. It is the shape
ADR-0011 rejected an ORM's escape hatches to avoid.

**Pointing at the `Cra` instead of copying its numbers.** The normalised answer, and it is wrong for
a legal document: an invoice is a statement of what was agreed at the time it was issued. The rate
must be a copy, not a reference — `BUILD-RULES.md` § Domain invariants says so, and this is the line
where the rule is applied.

## Reconsideration threshold

Reopen when a **third** origin exists. Two variants are a union; three with materially different
field sets is where the line stops being one type with a discriminator and becomes a document model
in its own right — at which point the question is whether the invoice holds lines of several kinds
or several sections of one kind each.

Also reopen if a single line ever needs **two** origins at once — a milestone that consumes days,
for instance. That is not polymorphism, it is composition, and it needs a different answer.

## Consequences

Adding `Forfait` billing later is a variant, a `case`, and a rendering rule. The type checker
produces the list of places to change, and no issued document is touched.

The cost, stated: every consumer of a line — a screen, an export, a total — either ignores the
origin or switches on it, and today that switch has exactly one branch. A reader who has not read
this ADR will see a union of one and think it is over-engineering. That is the price of the
decision, and it is why the ADR names the retrofit rather than the possibility.
