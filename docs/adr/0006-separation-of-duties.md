# ADR-0006 — Separation of duties: two rules, and where they are enforced

- **Date**: 2026-08-18
- **Status**: accepted

## Context

The chain this mockup builds turns a keyboard into revenue: a consultant records days, someone
accepts them, and the acceptance drafts an invoice to a client. If one person can do all of it,
there is no control between an entry and a demand for payment — and the firm this ERP is written
for sells audit and _habilitation_, so an internal tool with no control in it is an awkward thing
to demonstrate.

The reflex answer is an approval workflow: roles, matrices, delegation, an engine to drive them.
That is a product in itself, and it is not this one. The question here is what the **minimum**
enforceable control is, and — the part that actually decides the design — **on which side of the
module boundary** each half of it can be checked, given that `billing` may import nothing from
`timesheet`.

Separation of duties is not authorization, and the two are decided separately. Authorization says
_which_ people may act on a record (a manager of their own office, ADR-0003, and the dated manager
of that month). Separation of duties says the acts must be performed by **different** people,
whoever they are. Both apply, and neither replaces the other.

## Decision

Two rules. No workflow engine, no role matrix, no delegation model.

**1. Whoever records a Cra does not validate it.** Enforced in the `Cra` aggregate: validating with
the consultant's own identity throws `SelfValidationForbiddenError`, and the Cra stays `Submitted`.
It is in the aggregate rather than in a controller because the aggregate is the only thing on every
path — the use case, a future job and the seed all go through it.

**2. Whoever validates a Cra does not issue the invoice drafted from it.** Enforced in `billing`,
at issuance, in Phase 2. This is the rule that shaped the event contract: the payload carries
`validatedBy` **so that `billing` can enforce it without ever importing `timesheet`**. The identity
of the validator travels with the fact, which is the only way a sealed module can hold a rule about
someone else's act.

Neither rule is configurable. They are two lines of code with two tests, in the places the acts
happen.

## Rejected option

**A generic approval workflow** — states, roles, transitions and approvers described in data,
driven by an engine. The honest reason it is tempting: a second document (the invoice) has states
too, so an engine looks like it would pay for itself twice. It loses on YAGNI, decisively at this
size — the engine is more code than the two rules it would drive — and on something worse than
size: the rules become configuration, where the type checker cannot see them and no test naturally
covers them. A control that lives in a table is a control nobody notices being switched off.

**Enforcing in the API layer.** One place, easy to read, and it is where most applications put it.
It loses because it is not on every path: the seed builds validated Cras, Phase 3 will have jobs,
and a rule enforced in a controller is a rule that stops existing the moment a second caller
appears.

**Letting `billing` ask `timesheet` who validated the Cra.** The direct way to enforce rule 2 —
and the exact import the cruiser forbids. Rejected without hesitation, and it is the reason
`validatedBy` is in the payload: the boundary is not worked around, the contract is designed so the
question never has to be asked.

## Reconsideration threshold

Reopen when a **third act** needs a control — the classic one is payment: whoever issues an invoice
should not be the one to mark it settled. Two rules are two `if`s; four rules with delegation is
where a real model earns its place.

Also reopen on **delegation**: a manager on leave whose validations are performed by a peer. That
introduces "acting on behalf of", which neither rule expresses, and it must be modelled explicitly
rather than by relaxing rule 1.

## Consequences

The demo needs at least two people, and so does the seed: a single persona cannot walk the chain
end to end, by design. The persona selector of Phase 5 has to offer a consultant **and** a manager,
and that is a feature of the demonstration rather than a nuisance — the refusal is visible in three
clicks.

Rule 2 is **not enforced yet**: `billing` does not exist beyond a status enum, and issuance is
Phase 2. What Phase 1 delivers for it is the contract that makes it enforceable — `validatedBy` in
the payload — and this ADR is the record that the rule was decided here rather than discovered
there.

The cost of putting rule 1 in the aggregate is that the identity of the actor has to reach the
domain: `validate()` takes a `by`, and it cannot be defaulted. That is intentional. A method that
can be called without saying who is calling is a method that will be.
