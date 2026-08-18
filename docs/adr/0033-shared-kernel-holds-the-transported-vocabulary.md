# ADR-0033 — The shared kernel holds the vocabulary the boundary transports

- **Date**: 2026-08-18
- **Status**: accepted

## Context

`docs/BUILD-PLAN.md` lists `Period`, `Tjm` and `HalfDays` as value objects of Phase 1, which is the
`timesheet` phase. Writing them inside `packages/timesheet` would be the literal reading, and it
does not survive contact with the rule this repository is built on: `billing` may import **nothing**
from `timesheet`, and dependency-cruiser enforces it. Phase 2 multiplies a count of half-days by a
Tjm. So a value object placed in `timesheet` today is a value object `billing` will have to
redefine in a week.

The question is therefore not "where does `Tjm` go" but "what is the shared kernel for", and it has
to be answered before the first value object is written rather than discovered when Phase 2 hits the
cruiser.

`@erp/platform` already exists, both modules are already allowed to import its public index, and
its package description already claims "money, clock, domain events, typed errors".

## Decision

A value object lives in `@erp/platform` when **the event payload carries it, or both modules' rules
read it**. Everything else lives in the module whose rules are the only ones that read it.

That puts in the kernel: `IsoDate` (with the calendar arithmetic dates need), `Period`, `HalfDays`,
`Tjm`, the dated-reference resolution, the `Clock`, the typed-error base classes and the event
contract. It leaves in `timesheet`: `Cra`, `CraLine`, `DayType`, `WorkingCalendar`, the reference
projections and the manager attachment — and, symmetrically, it will leave the invoice, its lines
and the VAT resolution in `billing`.

The kernel holds **shape**: types, factories, and the refusals that keep an invalid value from
existing. It holds **no data** and **no module's rules**. `WorkingCalendar` is the test case for that
line and it stays out: it is made of dates, but it decides what may be billed in France, which is a
rule — ADR-0004 already places it in the domain.

## Rejected option

**The value objects in `timesheet`, and `billing` gets its own in Phase 2.** The literal reading of
the plan, and duplication is not automatically wrong — this repository requires it at the invoice's
documentary freeze. It loses because the two copies would be _definitions of the same unit_, and the
enforced boundary is precisely what guarantees nobody notices them diverging: the import that would
have made the divergence a compile error is the import the cruiser forbids. A half-day that means
`0.5` on one side and `1` on the other is the failure family this repository exists to rule out.

**A third module, `shared-domain`.** Cleaner on paper: the kernel keeps infrastructure concerns, a
domain-shared package keeps domain vocabulary. It loses on arithmetic — that is a fourth package,
a fourth `tsconfig`, a fourth set of cruiser rules and a fourth entry in the whitelist, for about
five files — and on the fact that the kernel's mandate is already exactly this. YAGNI is the sorting
criterion and it sorts this one.

**Everything shared eventually, so everything in the kernel.** Rejected as the junk-drawer ending:
a kernel that holds both modules' rules makes the boundary vacuous, because each module then imports
the other's logic through the middle. The criterion above is deliberately narrow so that the answer
to "may this go in the kernel" is usually no.

## Reconsideration threshold

Reopen when a kernel value object grows a rule only one module needs — a `Period` that learns about
the billing close date, an `IsoDate` that learns about the firm's holidays. That is the signal it
has stopped being vocabulary; it moves down into the module that owns the rule, and the kernel keeps
the primitive.

Also reopen if the kernel grows past the vocabulary the boundary transports plus the `Clock`, the
typed errors and the event contract. At that size it is worth splitting, and the third-module option
rejected above becomes the right one.

## Consequences

Phase 2 imports a half-day and a Tjm rather than redefining them, and the unit that crosses the
boundary in the event payload is the same type on both sides.

`vitest.config.ts` measures coverage on `packages/platform/src/**` as well as on each module's
`domain/`: this decision moves domain-grade code into a package that has no `domain/` directory, and
leaving the glob alone would have quietly exempted the most reused code in the build.

The cost is one indirection for a reader: "where is `Period` defined" is answered by the kernel's
public index rather than by the module being read. The cruiser's allowed list already documents that
arrow, and it is the only one both modules share.
