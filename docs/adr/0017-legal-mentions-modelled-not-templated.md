# ADR-0017 — Mandatory legal mentions are modelled on the document, not templated

- **Date**: 2026-08-18
- **Status**: accepted

## Context

A French invoice between businesses must carry a list of mentions fixed by law: the identity of both
parties with the seller's legal form, share capital, SIREN and RCS registration, the intra-EU VAT
numbers, the date and the number, the period of execution, the quantity and unit price per line, the
VAT recapitulative per rate, the payment terms and the due date, the late-payment interest rate, the
€40 fixed recovery indemnity, and the early-payment discount terms — the last one **even to state
that there are none**. The 2026 reform adds four more: the customer's SIREN, the delivery address,
the category of the operation, and the seller's option to account for VAT on debits.

The default way to satisfy that list is a template: an HTML page, or a PDF layout, with the fields
interpolated. It is what every invoicing tool does, and it is why the README already rejects a
template engine as "the first source of bugs in Dolibarr".

The failure mode is specific and worth naming. A mention that lives only in a template is a mention
that can stop being printed — a layout change, a second template for a credit note, a screen that
renders "the same" invoice differently — and **nothing fails**. There is no type to break, no test
that naturally covers it, and the document is still legally deficient. It is the same shape as a
green gate that stopped looking, which this repository has already recorded twice.

## Decision

Every mandatory mention is a **field of the domain model**, and the renderer prints what it is
given. `LegalEntity` carries the seller's legal identity; `BilledParty` is the client **copied onto
the document**; `LegalMentions` carries the late-payment rate, the recovery indemnity, the
early-payment discount, the operation category and the debits option; `PaymentTerms` carries the
term and computes the due date; `VatGroup` carries the recapitulative row with its mention.

Three of them are **validated**, not merely stored, because a wrong value is not a stylistic choice:

- payment terms are capped at **60 days net or 45 days end of month**, and an agreed term above the
  cap is refused — it is void in law, not unusual;
- the recovery indemnity must be exactly €40, fixed by decree, so it is on the model because it is
  printed and checked because it is not the firm's to choose;
- the late-payment rate is refused below the legal floor, where the clause would be void and the
  legal rate would apply instead.

"None" is a **value** of the early-payment discount, not a missing field. That is the whole
mechanism in one line: the type cannot represent an invoice that forgot to say there is no discount.

Two dates that the reform and the tax code let drift apart are pinned here, and both are decisions
rather than side effects of what the drafting function happened to have in scope:

1. **"45 jours fin de mois" is computed as: add the days, then move to the end of that month.** The
   law does not choose between the two accepted readings; the other one — end of month first, then
   add the days — gives 15 May instead of 30 April on a 15 March invoice. The invoice states which
   it used.
2. **The VAT rate and the `Tjm` are both resolved at the close of the period the work covers.** One
   rule, one dated mechanism (ADR-0034), for both references. The alternative — the `Tjm` at the
   close of the period and the VAT at the invoice date — is defensible and is what the debits option
   would suggest, and it splits the document across two resolution dates for a distinction
   (_fait générateur_ versus _exigibilité_) this build is not in a position to settle. The residual
   doubt is where it belongs: the open question recording that these rules have not been validated
   by an accountant.

## Rejected option

**A template with the mentions in it**, the universal answer. It loses on the failure named above: a
missing mention produces a legally deficient document and a green build. It also loses twice over
here, because the invoice and the credit note are two documents that must carry the same mentions —
two templates, one of which will drift.

**A single free-text "legal footer" string, composed once and stored.** Halfway house, and it does
survive a layout change. It loses because nothing can validate it: a cap on payment terms cannot be
checked inside a paragraph, and the €40 indemnity becomes a typo away from wrong with no way to
notice.

**Validating the mentions at the API boundary with Zod.** Zod is in the stack for exactly this shape
of work, and the boundary is where an invoice's inputs will arrive. It loses because these are
domain invariants and not input shapes: the seed builds invoices, Phase 3 will build them inside a
transaction, and a rule enforced at the boundary stops existing the moment a second caller appears —
the same reason ADR-0006 refused to put separation of duties in a controller.

## Reconsideration threshold

Reopen when the mentions become **per-client or per-contract** rather than per-entity — a framework
agreement that negotiates its own payment terms and its own late-payment rate is the realistic
trigger, and it turns `LegalMentions` from a property of the firm into a dated reference like the
`Tjm`.

Reopen the two date rules on any of: the firm moving to VAT **on collection** rather than on debits,
which separates the invoice date from the VAT date and is already ADR-0010's threshold; or an
accountant's review contradicting the end-of-month reading, which is what the open question exists
to collect.

## Consequences

A screen cannot omit a mandatory mention by accident — it renders fields, and a missing field is a
type error. The invoice and the credit note carry the same object, so they cannot drift.

The cost is that the mentions are now data the seed has to supply and Phase 3 has to store: five
extra columns on a table, and a `LegalEntity` row that has to exist before any invoice does. That is
real work, and it is the work that makes the mentions checkable.

The rates, caps and mentions recorded here are those known on 18/08/2026, and they inherit the open
question already recorded for ADR-0010: **none of this has been validated by an accountant**, and
the README says so.
