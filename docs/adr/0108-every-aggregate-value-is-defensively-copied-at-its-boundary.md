# ADR-0108 — Every aggregate value is defensively copied at its boundary

- **Date**: 2026-09-07
- **Status**: accepted

## Context

`Cra` carries three `Date` fields — `submittedAt`, `validatedAt`, and `CraRefusal.at` — none of
them copied on the way in (`reconstitute`'s input, a transition's own `input.clock.now()`) or the
way out (the getters). Reproduced with no type cast: `validatedCra().validatedAt.setUTCFullYear(2030)`
changes the aggregate's own validation timestamp, because `get validatedAt()` returns
`this.#validatedAt` — the exact object the internal field points at — and `Date.setUTCFullYear`
mutates that object in place. The same hole exists symmetrically on the way in: this codebase's own
`fixedClock` test double returns the identical `Date` instance from every `now()` call in its
lifetime, so a transition that stores `input.clock.now()` directly can end up holding a reference a
caller — or a future, less careful `Clock` implementation — still holds too.

The first pass on this ADR stopped there and reasoned that every other value object in both domains
(`CraLine`, `InvoiceLine`, `VatGroup`, `BilledParty`, `LegalEntity`, `PostalAddress`,
`LegalMentions`, `PaymentTerms`) was safe because it holds only strings, numbers and nested objects
built from those, "none of which have a mutating method a caller could reach without a cast." That
claim is true and irrelevant: a `Date`'s mutating method is _one_ way to move a value already held
by reference, but reassigning a field directly — `(invoice.billedTo.billingAddress as { line1:
string }).line1 = 'stolen'` — needs no method at all, only a cast, and a cast defeats `readonly`
identically whether the field behind it is a `Date` or a `string`. A probe test written against
`Invoice.billedTo.billingAddress` after this ADR's first version shipped failed immediately: the
getter returns `this.#billedTo`, the exact object built at drafting, and its nested
`PostalAddress`, `LegalEntity.address`, `InvoiceLine.origin` and `VatGroup.treatment` were never
copied on the way in or the way out. The audit's own "Done when" clause names this directly:
"including nested addresses, line origins, VAT treatments, and timestamps" — four surfaces, and the
first pass on this ADR had closed only the fourth.

`Cra.lines`/`Invoice.lines`/`Invoice.validatedBy` already returned a fresh array on every read
(`[...this.#lines]`) before this ADR, which stops a caller pushing or splicing — but a shallow array
copy does not copy the elements inside it, so a line or VAT group already in the array was still
reachable and mutable by reference through it. `Cra.lines` is in fact the _first_ item the audit's
own evidence line names ("`Cra.reconstitute`, `Cra.validatedAt`, `Cra.submittedAt`, `Cra.refusal`,
`Cra.lines`, and `Invoice` construction/getters retain or expose mutable object references") — a
third pass on this ADR closed it after the second pass's `Invoice`-side probe tests made the general
shape of the gap (shallow array copy, unshallow element) visible and a matching probe against
`Cra.lines[0]` confirmed it was open here too.

One exception was found in the array-copy line of defense itself: `Invoice#vatBreakdown` — added a
few hours earlier in this same branch, closing package 06 — returned `this.#vatBreakdown` directly
once an invoice is issued, the one getter in either domain that still handed out its own internal
array by reference rather than a copy, breaking the pattern `get lines()`/`get validatedBy()`
already establish next to it in the same file.

`CreditNote` (`packages/billing/src/domain/credit-note.ts`), the third surface the audit names, has
no `Date` field at all — `issueDate: IsoDate`, a string — and its array/object fields are sourced
from `Invoice`'s own getters (`invoice.lines`, `invoice.billedTo`, `invoice.seller`), which this ADR
now makes copy at every read. It is a plain value with no lifecycle ("issued in one act and never
changes... which is why it is a value and not an aggregate"), reviewed here and found to need no
change of its own — it inherits the fix through `Invoice`.

## Decision

**`Cra`** (`packages/timesheet/src/domain/cra.ts`) — three module-level helpers:

```ts
function copyDate(date: Date | null): Date | null {
  return date === null ? null : structuredClone(date);
}

function copyRefusal(refusal: CraRefusal | null): CraRefusal | null {
  return refusal === null ? null : { ...refusal, at: structuredClone(refusal.at) };
}

function copyLine(line: CraLine): CraLine {
  return { ...line };
}
```

`structuredClone`, not `new Date(date.getTime())`: the domain's own lint rule
(`eslint.config.js`'s `NO_DOMAIN_CLOCK`) bans the `new Date(…)` constructor outright anywhere in
`packages/*/src/domain/`, on purpose, because it cannot distinguish a clone from a read of the wall
clock — and a syntactic carve-out for "this call is fine" is exactly the kind of exception that
erodes a rule until nobody trusts it. `structuredClone` copies a `Date` without that syntax, so the
rule stays absolute rather than gaining a documented exception. Applied at every boundary a `Date`
crosses, in both directions: **in**, via `reconstitute` (`submittedAt`, `validatedAt`, `refusal`
copied before being stored) and via each transition's own write (`submit()`, `validate()`,
`refuse()` copy `input.clock.now()` before storing it, rather than trusting the `Clock` contract to
hand back a fresh instance every call — it does not promise that, and this codebase's own test
double does not keep it); **out**, via the getters (`get submittedAt()`, `get validatedAt()`, `get
refusal()` return a copy, never `this.#field` itself).

`copyLine` is a shallow spread, not `structuredClone`: `CraLine` holds only strings, a nullable
string and a number, with no `Date` and no further nesting — the mutating-method problem
`structuredClone` solves for `Date` does not apply, only the cast-based-reassignment one a plain
spread already closes. Applied at the same two boundaries as the array container itself: `get
lines()` returns `this.#lines.map(copyLine)` rather than `[...this.#lines]`, and `reconstitute`
pushes `input.lines.map(copyLine)` rather than the caller's own line objects.

**`Invoice`** (`packages/billing/src/domain/invoice.ts`) — one helper per value shape it holds,
each one level deep because none of these types nest any further than that:

```ts
function copyAddress(address: PostalAddress): PostalAddress {
  return { ...address };
}
function copyBilledParty(party: BilledParty): BilledParty {
  return { ...party, billingAddress: copyAddress(party.billingAddress),
    deliveryAddress: copyAddress(party.deliveryAddress) };
}
function copySeller(seller: LegalEntity): LegalEntity {
  return { ...seller, address: copyAddress(seller.address) };
}
function copyTerms(terms: PaymentTerms): PaymentTerms {
  return { ...terms };
}
function copyMentions(mentions: LegalMentions): LegalMentions {
  return { ...mentions, earlyPaymentDiscount: { ...mentions.earlyPaymentDiscount } };
}
function copyLine(line: InvoiceLine): InvoiceLine {
  return { ...line, origin: { ...line.origin }, vat: { ...line.vat } };
}
function copyVatGroup(group: VatGroup): VatGroup {
  return { ...group, treatment: { ...group.treatment } };
}
```

Applied symmetrically: the private constructor (the single choke point both `draft` and
`reconstitute` pass through) copies `seller`, `billedTo`, `terms`, `mentions` and every line on the
way in; `reconstitute`'s separate `#vatBreakdown` assignment (set after construction, since it is
`null` for a draft) copies each group the same way. Every getter that used to return `this.#field`
directly — `seller`, `billedTo`, `terms`, `mentions`, `lines`, `vatBreakdown` — now returns a copy
built the same way, matching the shape `get lines()`/`get validatedBy()` already had for arrays
before this ADR.

`DocumentTotals` (`invoice.totals`) is deliberately **not** added to this list: the audit's "Done
when" clause names addresses, line origins, VAT treatments and timestamps, not totals, and unlike
the others `#totals` is never assigned from a caller-supplied reference — `issue()` stores a value
it just computed itself (`totalsOf(this.#lines)`), and reconstitution stores a value the repository
row-mapper builds fresh per read. There is no code path today that hands a `DocumentTotals` object
to two owners. If one appears, this is the same shape of gap and the same fix.

## Rejected option

**Replace `Date` (and the copied plain objects) with immutable/branded types** — a branded
`IsoTimestamp` string for the `Date` fields, and, by the same logic, value types for `BilledParty`
etc. that cannot be constructed except through a copying factory — removing the mutability class
entirely rather than defending against it at each boundary.

Rejected for this pass on the audit's own instruction: "Avoid a generic deep-copy framework; the
small set of actual aggregate fields is enough." The fields needing the fix are enumerated and
finite — three `Date` fields in one file, six value shapes in another, each one level deep. A
branded-type approach would touch `Clock.now(): Date` (a shared-kernel contract with callers across
both modules and every test in the repository that constructs a `Clock`), every `Date`-returning
test double, the formatting code that already calls `Date` methods on these values for display, and
every call site across `billing` that builds a `BilledParty`/`LegalEntity`/`InvoiceLine` today with
an object literal. That is a second, larger, and unrelated decision — worth making on its own if
this shape of bug recurs a third time.

## Reconsideration threshold

Reopen if either domain package adds a new mutable-by-cast field to a value object that a getter
hands back by reference, or if a second aggregate needs its own copy of the `copyBilledParty`-style
helpers above — at that point the per-type helper functions, unable to be shared between the two
packages without violating the sealed-module boundary (ADR-0001), are the signal that the rejected
option above should be revisited instead.

## Consequences

- `packages/timesheet/src/domain/cra.test.ts` gained a dedicated block proving the timestamp
  invariant from both directions with no type cast anywhere in it: mutating a getter's return
  value, mutating the clock's `Date` after a transition used it, and mutating a `Date`/`CraRefusal`
  object after passing it to `reconstitute` — all confirmed to leave the aggregate unchanged, each
  verified to fail before the fix and pass after. A second block does the same for `Cra.lines` with
  a cast (`(cra.lines[0] as { quarterDays: number }).quarterDays = 1`), also verified to fail
  (3/3) before `copyLine` and pass (48/48) after.
- `packages/billing/src/domain/invoice.test.ts` gained: the array-copy test for `vatBreakdown`
  (matching `'hands out its lines as a copy'`'s shape); cast-based mutation probes against
  `billedTo.billingAddress`, `seller.address`, a line's `origin` and a line's `vat` treatment,
  every one of which failed before the second pass on this ADR and passes after; and one "in the
  door" test mutating a `billedTo`/`seller` object _after_ handing it to `Invoice.draft`, proving
  the aliasing risk is closed on both sides of the boundary, not only the getter side.
- `packages/timesheet/src/infrastructure/pg-cra-repository.int.test.ts`'s existing round-trip tests
  for a refused and a validated `Cra` were tightened from `toBeInstanceOf(Date)` to a `.getTime()`
  equality against the clock's own timestamp — proving the instant itself survives the
  `TIMESTAMPTZ` round trip and this ADR's copy boundary together, not merely that some `Date` came
  back; the upsert regression test gained the same assertion for `submittedAt`.
- `CreditNote` needed no change of its own — reviewed and confirmed to carry no `Date` and to source
  every array/object field from `Invoice` getters, all of which now copy.
