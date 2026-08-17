# ADR-0002 — Money is an integer number of cents, with no wrapper type

- **Date**: 2026-08-17
- **Status**: accepted

## Context

The mockup drafts invoices in régie: billable days × Tjm, VAT computed per line. Any float on a
monetary value is out of the question — it is the first thing a reader of this repository will
check, and one-cent discrepancies reported by accounting are the classic symptom.

Two questions are usually conflated: how a monetary value is **represented**, and whether it is
**wrapped in a type**. They are decided separately here.

## Decision

A monetary value is an **integer number of cents**, in the domain, in the database, and on the wire.
No decimal, no float, ever.

There is **no `Money` value object**. Cents are plain integers, added and multiplied directly.

## Rejected option

**`numeric(14,4)` in Postgres with a decimal library in the domain.** The standard answer, and the
right one when unit prices carry more than two decimals or when several currencies coexist. It loses
here because a Tjm is a whole-euro daily rate, the only computation is days × rate plus VAT per
line, and nothing in the scope needs a third decimal. It also costs a dependency whose transitive
weight buys nothing at this size.

**A `Money` value object wrapping the integer.** Considered and dropped for simplicity: with one
currency and one billing model, a class with `add` and `multiply` is ceremony around `+` and `*`.
The trade-off is stated under Consequences, and it is real.

## Reconsideration threshold

Reopen on any of: a **second currency**; a **unit price needing more than two decimals**; or a
billing model requiring **allocation/proration**, where a total must be split across lines without
losing or inventing a cent. That last one is the real trigger — allocation is where naive integer
arithmetic silently drops remainders, and it is exactly what a fixed-price or milestone model would
introduce.

## Consequences

Arithmetic is trivial and needs no library. The database stores `bigint`, comparisons and sums are
exact, and the seed data is readable.

The cost is named debt: rule 4 of `CLAUDE.md` ("never a floating-point number on a monetary value")
becomes **the only one of the five architecture rules that no machine enforces**. The lint rule that
would forbid bare arithmetic on money has nothing to match on, because a monetary value is now
indistinguishable from any other `number`. Nothing stops a future line from adding a value in cents
to one in euros, or from introducing a `/ 100` that rounds.

Two mitigations are in reach and are not taken here, so they are recorded rather than forgotten:
naming the unit in every identifier (`amountCents`, `tjmCents` — cheap, conventional, unenforced),
and a branded type (`type Cents = number & { readonly __brand: 'Cents' }` — still an integer at
runtime, zero cost, and enough for the type checker to reject mixing units).

Rounding remains a domain decision regardless: VAT is computed and rounded **per line**, to the
cent, never on the total.
