# ADR-0035 — Exact money arithmetic: half-up on integers, rates in basis points

- **Date**: 2026-08-18
- **Status**: accepted

## Context

`docs/BUILD-RULES.md` § Money has said, since Phase 0 and in the present tense, that "the lint rule
therefore forbids float-producing arithmetic on money — no `parseFloat`, no `Number()` on a decimal
string, no `Math.round` used to recover from one". No such rule existed. For two phases the
repository's single most advertised invariant — never a float on a monetary value — was the only
one of the five architecture rules of `CLAUDE.md` held by nobody but the author's attention.

ADR-0002 predicted this and called it named debt: with money represented as a plain integer, "the
lint rule that would forbid bare arithmetic on money has nothing to match on, because a monetary
value is now indistinguishable from any other `number`". That is true of the **semantic** rule and
it is not true of the rule `BUILD-RULES.md` actually specifies. `parseFloat`, `Number()` and
`Math.round` are three identifiers; they are matchable without knowing what any value means.

Phase 2 is where it stops being theoretical. It multiplies a count of half-days by a Tjm, rounds,
groups by VAT rate, and rounds again — and one of the rates it must model is **8,5 %** for
Guadeloupe, Martinique and La Réunion (ADR-0010). A rate that is not a whole percentage is where a
`0.085` enters a codebase, and after that every amount downstream of it is a float regardless of
how carefully the cents were kept.

## Decision

Three rules, and each ban names what replaces it.

**1. Rounding is half-up, written on integers, and `Math.round` is banned.** `Math.round` takes a
float, so reaching for it means a float already exists — it is the recovery, not the rounding.
Half-up on integers is written with the remainder and no intermediate float: take
`remainder = numerator % denominator`, divide `numerator - remainder` — a multiple of the
denominator by construction, so that division is exact rather than rounded — and add one when
`remainder * 2 >= denominator`.

**2. A rate is an integer number of basis points, never a decimal fraction.** 20 % is `2000`, 8,5 %
is `850`, 0 % is `0`. Applying a rate is `roundHalfUp(amountCents * basisPoints, 10_000)` — one
multiplication and one guarded division, both on integers.

**3. A decimal literal is a lint error in the domain and in the kernel.** This is the rule that
makes the second one hold: `850` and `0.085` are equally easy to type, and only one of them fails
the build. The ban is lifted in a **test**, because a negative test proves a factory refuses a
float by handing it one — `halfDays(1.5)` cannot be written otherwise — and the calls stay banned
there, because a `Math.round` added to make an assertion pass is the failure itself. The fixtures
that prove both verdicts live in `packages/billing/src/domain/__boundary-fixture__`.

## Rejected option

**A branded `Cents` type**, which ADR-0002 recorded as a mitigation in reach and deliberately not
taken. It is the stronger guard for the rule this one cannot express — adding cents to euros — and
it stays rejected here for the reason ADR-0002 gave and one more: it would catch a **unit** mix and
would not catch a single one of the three failures above. `parseFloat` on a decimal string returns
a value the brand would happily accept. The two guards are not substitutes, and this is the one
Phase 2 needs.

**Rates as a decimal fraction with rounding at the end.** The universal default, and it is what
every spreadsheet does. It loses on the one case that is not a whole percentage: `1000 * 0.085` is
`85.00000000000001` in IEEE-754, and the invoice that carries it is out by a cent in a direction
nobody chose. Basis points cost one constant and remove the class.

**Leaving the rule semantic and unenforced**, i.e. accepting ADR-0002's Consequences section as the
final word. It loses because the sentence in `BUILD-RULES.md` was already written as though the
rule existed. A document that describes a guard that is not there is worse than one that admits the
gap: it is the exact failure the Phase 1 checkpoint recorded twice — a green gate that stopped
looking.

## Reconsideration threshold

Reopen on a rate that is not expressible in basis points — a fourth decimal, which French VAT does
not have but a foreign withholding tax might — or on the first amount that must be **allocated**
across lines (a discount, a down payment, proration). Allocation is where half-up per line stops
summing to the whole, and it needs a distribution rule, not a rounding rule. It is also ADR-0002's
own threshold, so both reopen together.

Reopen the decimal-literal ban if it ever refuses a value that is genuinely not money and genuinely
not expressible as an integer. None exists in this scope: the domain holds amounts (cents), rates
(basis points), quantities (half-days) and dates (integers). The ban is narrow because that list
is short, and the day the list grows is the day to look again.

## Consequences

`CLAUDE.md` rule 4 — "never a floating-point number on a monetary value" — stops being the one
architecture rule no machine enforces. The sentence in `BUILD-RULES.md` becomes true of the
repository and not only of the document.

The cost is a rule that is stricter than its subject: the decimal-literal ban applies to every file
of the domain and the kernel, not to money alone, and it forbids a float that would have been
harmless. That is deliberate — a guard whose scope is "money" needs to know which values are money,
which is the thing ADR-0002 gave up. Scoping it to the domain instead is what makes it enforceable
at all, and the domain has no legitimate use for a float.
