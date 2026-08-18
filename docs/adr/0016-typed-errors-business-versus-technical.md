# ADR-0016 — Typed errors: business versus technical, and how they reach the wire

- **Date**: 2026-08-18
- **Status**: accepted

## Context

`BUILD-RULES.md` already forbids a bare `new Error()`, and an ESLint rule enforces it in every
package. Until this phase that rule pointed at nothing: there was no type to throw instead, so the
first factory written under it would have had to invent one on the spot.

Two questions have to be answered together, because answering only the first is what produces the
familiar pile of one-off error classes:

1. What distinction does the type system carry? A refusal by a rule of the domain and a lost
   database connection are not the same event: the first is expected, is part of the contract, and
   says something the caller must be told; the second says nothing about the request and may
   succeed on the next attempt.
2. Where does the translation to HTTP happen? The modules must not know that HTTP exists — the
   dependency-cruiser whitelist lets a module import `@erp/platform` and nothing else, so a domain
   module cannot import `@erp/contracts`, where the RFC 9457 problem shape lives.

## Decision

Two abstract base classes in `@erp/platform`, and no third kind.

**`BusinessError`** — a rule refused. It carries a **`problemType`**, a stable identifier of the
refusal written as a relative URI reference (`/problems/cra-immutable`), and a **`details`** record
holding the business fields of the refusal: the invariant that was violated, with the values that
violated it. It carries **no HTTP status**.

**`TechnicalFailure`** — something under the code gave way. It carries `retryable` and the
underlying `cause`, and deliberately **no `problemType`**: there is no business rule to name, and
publishing one would invite a client to branch on an infrastructure accident.

`isBusinessError()` is the discriminator, and it is the only thing the wire mapping needs: a
business refusal is published with its type and its fields; anything else becomes a generic 500
with no internals in it.

**The mapping from `problemType` to HTTP status lives in `apps/api`** (Phase 5), never in a module.
`BUILD-RULES.md` fixes the mapping itself — validation → 400, violated invariant → 409, insufficient
scope → 403 with a reason — and this ADR fixes only **where** it is applied: on the side of the
boundary where HTTP exists.

## Rejected option

**A single `DomainError` with a `kind` field.** One class, one discriminated union, less ceremony —
and it is the option most codebases this size take. It loses on the property that matters here: a
`catch` that forgets to branch on `kind` treats a lost connection as a business refusal and answers
409 to the client. `instanceof` on two disjoint hierarchies makes the wrong branch a type error
rather than a runtime one, and the wire mapping is exactly the place that must not get it wrong.

**Carrying the HTTP status on the error.** Shorter: the handler reads `error.status` and is done. It
loses because it puts a transport concern in a domain module that the boundary rule exists to keep
free of transport, and because the same refusal reached through a CLI, a job or a test then drags a
status code it has no use for.

**Error codes as bare slugs** (`'cra-immutable'`) rather than URI references. Rejected on a detail
that costs nothing today and cannot be retrofitted: RFC 9457 says `type` is a URI, and a client that
resolves it expects a path. A slug promoted to a URI later changes every published identifier.

## Reconsideration threshold

Reopen if a third kind appears that is genuinely neither — the candidate is a **permission
refusal**, which is expected like a business error but must not publish the business fields of the
resource it is refusing. It is modelled as a `BusinessError` today; the day its `details` would leak
what the caller is not allowed to see, it needs its own base class and its own serialisation rule.

Also reopen if a module ever needs the HTTP status at the point of throw — that would mean a
transport has grown into the domain, and the question is the arrow, not the error type.

## Consequences

The ESLint rule that forbids `new Error()` now has something to point at, in the same phase that
writes the first code it applies to.

Every refusal that leaves the domain is publishable without a translation table: the type is on the
error and the fields are next to it. Empty, error and permission-denied states are deliverables here,
and this is what makes the error state say _why_ rather than "something went wrong".

The cost is two classes and a naming discipline: each new business error owes a `problemType`, and
those identifiers become public API the moment the first client reads one. They are collected in
`apps/api` at Phase 5, which is also where a duplicate becomes visible.

`TechnicalFailure` has **no subclass in this phase** — the domain performs no I/O, so nothing throws
one yet. It is written now because the discriminator is meaningless with only one side of the
dichotomy in existence, and because Phase 3's first `pg` adapter must find it already there rather
than invent it under deadline.
