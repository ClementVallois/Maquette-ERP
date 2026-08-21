# ADR-0059 — A screen carries its `Idempotency-Key` in a hidden field

- **Date**: 2026-08-21
- **Status**: accepted

## Context

Three verbs of the CRA-to-invoice chain existed only in `/api/v1` at the end of task 6.5: a manager
**validates** a submitted month, a manager **refuses** it with a reason, and billing **issues** the
draft invoice. `docs/BUILD-PLAN.md` § 6 names the screens and never names these actions, so on the
instance the `manager` and `billing` personas could read everything and do nothing — the chain the
repository exists to demonstrate would have to be walked in `curl`, including the two steps that
prove separation of duties (ADR-0006).

Wiring the first two is plumbing. The third is not, and the obstacle is structural rather than
cosmetic:

**`POST /api/v1/invoices/:id/issuance` requires an `Idempotency-Key` header** (ADR-0044), because
it is the one call that allocates a number from a gapless series and a retry without a key burns a
second one. **An HTML form cannot set a header.** ADR-0009 says there is no client script and
ADR-0049 makes `script-src 'none'` a header the browser enforces, so no code on the page can add
one either.

This is the same shape as the collision ADR-0052 resolved for the margin reveal: a decision taken
for the API meets a decision taken for the screens, and one of them has to give in a way that does
not weaken either.

## Decision

**The screen mints the key when it renders the form, and carries it in a hidden field. The web
route reads it from the body and passes it to the same `issueInvoice` the API route calls.**

- **The key is a UUIDv7 from the same injected factory as every other identifier** (ADR-0041), so
  it is deterministic under a fake clock in tests and unique in production without a second
  generator.
- **It is minted per _render_, not per invoice.** Two loads of the page produce two keys, and that
  is correct rather than sloppy: the key's job is to recognise **this submission arriving twice** —
  a double click, a retry after a timeout the user never saw an answer to. Two deliberate
  submissions from two loads are two intents, and the second is refused anyway by the state
  machine, which is where the real guarantee lives.
- **The gapless series is therefore guarded twice, by two different mechanisms.** `Invoice.issue`
  refuses anything that is not a `draft` (`InvoiceTransitionError` → 409), so a second issuance
  cannot allocate a second number whatever key it carries. The idempotency key is what turns a
  _retry_ into the original answer instead of that 409. Neither substitutes for the other, and
  ADR-0044's stored-key index still makes a reused key visible.
- **The two other verbs need none of this.** Validation is idempotent by ADR-0021 — a replay
  answers with the documents the first one produced — and a refusal is a state transition that
  refuses from any state but `submitted`. Both are ordinary `POST`-then-redirect forms (303, as
  `redirectTo` already does), so a refresh does not repost.

## Rejected option

**Do not put issuance on a screen at all.** The reading of BUILD-PLAN 6.5 that adds nothing: it
asks for the invoice as a printable page and never for a button. It loses because it leaves the
`billing` persona with no action on the instance, which makes the second separation-of-duties rule
— whoever validates does not issue — undemonstrable on the thing a visitor actually opens. A rule
that can only be shown in `curl` is a rule the demo describes rather than performs.

**Drop the `Idempotency-Key` requirement for the web path.** The smallest change, and superficially
harmless because the state machine already blocks a second issuance. It loses because it makes one
guarantee depend on which door the caller came through, and the API's requirement then guards a
path nobody uses while the path everyone uses is unguarded. ADR-0044 exists because "the retry that
burns a number" is a real failure; a browser retries too.

**Put the key in the URL** — a query parameter on the form action. It works and it is worse in the
way this repository has already ruled on once: ADR-0023 refused a persona in a query parameter
because query strings leak through logs, referrers and shared links. An idempotency key is not a
secret, but a `GET`-shaped identifier for a state-changing request is the habit, not the exception.

**A per-invoice key derived from the invoice id.** Stable across renders, no hidden field, and it
sounds tidier. It is wrong: the key would then be the same for a legitimate re-issuance after a
credit note (the case ADR-0057 defers rather than forbids), and ADR-0044's reuse detection would
fire on a request that is not a retry.

## Reconsideration threshold

Reopen if a second action ever needs a header the browser will not let a form set — a
`If-Match`/`ETag` for optimistic locking is the likely one, and the README already lists it as
deferred to the target ERP. Two hidden fields carrying transport concerns is the point at which the
screens want a real form-submission layer rather than one more field, and that is a bigger decision
than this one.

Reopen also if the hidden field ever has to survive something the render does not control — a
browser restoring a form from bfcache, a page kept open for hours. The key is only as good as the
render that produced it, which is enough for a submission and not for a session.

## Consequences

**Easy.** The whole chain is walkable in a browser: a consultant records and submits, a manager
validates or refuses with a reason, billing issues a numbered document, and every step refuses the
actor who may not take it — with the reason rendered as a page. Both representations go through the
same `issueInvoice`, so there is one issuance and not two.

**Expensive.** The form carries a value that is about transport rather than about the invoice, and
a reader has to be told why it is there — which is what this ADR and the comment at the call site
are for. And two renders yield two keys, so the idempotency guarantee is scoped to a submission
rather than to an intention; the state machine is what covers the rest, and this ADR is explicit
that the two are different guarantees rather than one described twice.
