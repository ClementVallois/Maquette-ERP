# ADR-0036 — A credit note carries positive amounts; the document type carries the direction

- **Date**: 2026-08-18
- **Status**: accepted

## Context

The first function of the billing domain is `roundHalfUp`, and writing it forces a question nothing
in the repository had answered: **can an amount be negative?**

Half-up rounding is not symmetric across zero. Rounding −0,5 "up" means −0 in one reading and −1 in
the other, and both are defensible; JavaScript's `%` returns a negative remainder for a negative
dividend, so the naive implementation silently picks one without anyone choosing it. A rounding
function that answers differently on either side of zero is exactly the kind of thing that produces
a one-cent discrepancy nobody can reproduce.

The question is not academic, because this module will hold a `CreditNote` — the only correction of
an issued invoice (`BUILD-RULES.md` § Domain invariants), and the document whose whole purpose is
to reverse an amount. If a credit note is modelled as an invoice with negative lines, every amount
in the domain becomes signed and `roundHalfUp` has to answer on both sides.

`docs/adr/0018` will decide that invoices and credit notes share one number series for chronological
continuity, which makes them siblings in the document model and sharpens this question rather than
answering it.

## Decision

**Every monetary value in this domain is zero or positive.** `roundHalfUp` refuses a negative
numerator, and the refusal is a typed error rather than an undefined behaviour.

A `CreditNote` carries **positive** amounts. What reverses them is its **document type**: a credit
note of 1 200,00 € reduces what the client owes by 1 200,00 €, and the reduction is read from the
kind of document it is, not from the sign of a number inside it.

This matches how the document itself is read. A French _avoir_ prints positive amounts and states
that it is an _avoir_; an accountant reconciling a client account applies the sign from the document
type, not from the figures. It also matches the invariant already written down: an issued invoice is
never modified, so no line ever changes sign in place.

## Rejected option

**Negative lines on a correcting invoice.** The compact answer — one document type, one sum, and the
arithmetic does the rest. It loses on three counts, only the first of which is about rounding:
`roundHalfUp` becomes a function with two behaviours and a convention to remember; a partial credit
note becomes indistinguishable from a discount, which this mockup deliberately does not model
(README, "Ce que je ne construis pas"); and the mandatory VAT recapitulative per rate would have to
publish a negative rate group, which is not what the fiscal document says.

**Allowing negative amounts everywhere and rounding away from zero.** The mathematically tidy
option: symmetric, no special case. It loses because it buys generality nothing in scope needs — no
line, no total and no VAT amount in this build is ever negative — and because the guard that refuses
one is what turns "this cannot happen" from a comment into a test.

## Reconsideration threshold

Reopen on the first document that genuinely carries both directions in one place. The realistic one
is a **statement of account** or a settlement run showing invoices and credit notes side by side —
but that is a read model, and the sign belongs to its projection rather than to the domain values.

The real trigger is a **line-level discount or a down payment deduction**: both put a subtraction
inside a single document, before rounding, and both are already ADR-0002's and ADR-0035's threshold.
All three reopen together, which is the point of naming the same trigger three times.

## Consequences

`roundHalfUp` is total and has one behaviour. Its negative test — a refused negative numerator — is
the record that the alternative was considered.

The cost lands on whoever computes a client's balance: it has to know the document type to know the
sign, and a `SUM(amount_cents)` across both kinds of document is wrong. That is a real trap, and it
is the reason this ADR exists rather than a comment. When Phase 3 writes the tables, the balance is
`Σ invoices − Σ credit notes`, and the schema keeps both kinds in a shape where that is the obvious
query rather than a discovered one.
