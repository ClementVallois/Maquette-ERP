# ADR-0010 — VAT is rounded per rate, and the rate is resolved from territoriality

- **Date**: 2026-08-17
- **Status**: accepted

## Context

The README and `CLAUDE.md` both advertised, as a headline invariant, that "VAT is computed **per
line**, not on the total". That was written as a reaction to the common bug — computing VAT once on
the invoice total — and it is an improvement on it. But it is not the French rule.

The French rule groups lines **by rate**, computes VAT once per rate, and rounds once per rate. This
is not an implementation detail: the mandatory invoice footer is a recapitulative **per rate**, so
the grouping is structural to the document, not a computation shortcut. Rounding each line and then
summing produces a different total from rounding once per rate — that difference is precisely the
one-cent discrepancy accounting reports.

A second question was conflated with it. A consulting firm invoicing from Paris looks like it has
one rate, 20 %, forever — which is exactly how ERPs end up with `20` hard-coded and then bill a
Réunion client incorrectly. The rate is not an attribute of the service.

## Decision

**VAT is rounded per rate.** Lines are grouped by their frozen rate; VAT is computed and rounded once
per group; the invoice VAT total is the sum of those rounded amounts. Rounding is half-up, named
explicitly. The README and `CLAUDE.md` invariant is **reworded** to say this.

**The rate is resolved, never entered.** A function of four inputs — nature of the service, place of
taxation, status of the customer, and date of the chargeable event — returns the applicable
territorial regime. The resolved rate is then **frozen onto the invoice line** (ADR "gel
documentaire"): the line copies it and never reads the reference table again.

Three regimes are modelled, because each is a genuinely different case rather than a different
number:

- **Metropolitan France**: standard rate, from a **dated** reference table.
- **DOM where VAT applies** (Guadeloupe, Martinique, La Réunion): own rates, 8,5 % standard. One
  such client is in the seed — it is what proves the rate is not hard-coded.
- **Out of scope of French VAT**: Guyane and Mayotte (art. 294-1 CGI), and intra-EU B2B where the
  customer self-assesses (art. 259-1). These are modelled as **absence of a chargeable field**, not
  as a rate of 0 — they carry different mandatory mentions and different reporting.

An issued invoice is checked before it leaves: `total HT = Σ lines` and `total TTC = total HT + Σ VAT
per rate`. A mismatch is a typed refusal.

## Rejected option

**Per-line rounding**, as the README originally claimed. It loses because it is not the fiscal rule
and it disagrees with the footer the invoice is legally required to print — so the document would
have had to either publish a total that its own lines do not sum to, or recompute the footer
differently from the body. Keeping the original wording and quietly grouping by rate in the code was
the other tempting option, and it is worse: an invariant advertised at the top of a deliverable has
to be true.

**A single `vat_rate = 20` constant**, resolved nowhere. Shorter, and correct for every client in the
seed but one. It loses because it is the exact failure this section of the domain exists to avoid,
and because the corrective action for an under-taxed issued invoice is a credit note, not an edit.

**Modelling out-of-scope as a 0 % rate.** Convenient — one code path — and wrong: 0 % is a rate, and
"outside the scope of the tax" is not. They differ in the mention printed on the invoice and in what
is declared.

## Reconsideration threshold

Reopen on any of: **VAT on down payments** (the deduction of an advance and its VAT on the final
invoice must sum exactly to the VAT of the whole operation — the nastiest rounding case in the
domain, and currently excluded with the down payment itself); a **line-level discount**, which
reintroduces an amount to allocate before rounding; or the firm opting for VAT **on collection**
rather than on debits, which separates the invoice date from the VAT date and makes bank
reconciliation a fiscal requirement rather than a cash-flow metric.

The rates and thresholds recorded here are those known on 17/08/2026 and are stated in the README as
requiring validation by an accountant before any production use.
