# ADR-0044 — `Idempotency-Key` is stored, not merely required

- **Date**: 2026-08-19
- **Status**: accepted

## Context

ADR-0021 fixed idempotency for **validation**: replaying a `TimesheetValidated` drafts no second
invoice, and its closing line says "ADR-0021 … also covers the `Idempotency-Key` contract consumed
in Phase 5". `docs/BUILD-PLAN.md` § 5.3 requires the header on "the single POST that issues a
numbered document".

Building it surfaced two gaps between what those sentences promise and what the code could do.

**First**, ADR-0021 states the contract as "replay → **original result**, not rejection". The port
it left behind can only answer `hasCraBeenProcessed(craId): boolean`. A boolean cannot return an
original result, so the validation route could either answer an empty 200 — which is not the
original result — or a 409 — which is the rejection the ADR rules out.

**Second**, the header on its own guards nothing. A required `Idempotency-Key` that is validated
and then discarded changes no behaviour: a client that retries after a timeout it never saw the
answer to still issues a second document and still burns a second number from a series whose only
property is having none (ADR-0018). A gate that is present and inert is the failure family this
repository names in its own rules.

## Decision

**The key is persisted on the document it issued**, in `billing.invoices.issuance_idempotency_key`,
under a **partial unique index** (migration 009). Three consequences follow, and each is a
behaviour rather than a validation:

- **Same key, same invoice** → `200` with the **original** document: same number, same date, same
  totals, and `replayed: true`. Nothing is allocated.
- **Different key, already-issued invoice** → `409 /problems/invoice-transition-not-allowed`,
  raised by `Invoice.issue()` — the document state machine, not this mechanism. The number is not
  burned, because the sequence is allocated inside the same transaction the refusal rolls back.
- **Absent key** → `400 /problems/idempotency-key-required`, with the reason and the shape.

**The key is read before the invoice is.** The replay lookup is office-scoped, so an actor who may
not read the invoice does not learn from this route whether their key was used on one.

**The upsert uses `COALESCE`, not `EXCLUDED`, on that column.** A later `save` carries no key and
must not erase the one the issuance wrote. This is the lesson `source_cra_ids` taught in Phase 3 by
being silently blanked on issuance, and the same shape is refused here before it can happen again.

**ADR-0021's contract is honoured for validation too**, by giving the port the read it was missing:
`findDraftedFrom(craId, actor)` returns the invoices a previous validation drafted, so a replay
answers `200` with them and `replayed: true`. Validation deliberately takes **no** `Idempotency-Key`
— the CRA id is already a natural idempotency key for it, and asking a client to supply a second
one would be ceremony.

## Rejected option

**A dedicated `billing.idempotency_keys` table**, keyed by `(key, route)` and holding a serialised
response. It is the general answer, it works for routes that create nothing, and it is what a
payments API ships. It loses here on the same ground ADR-0021 rejected a `processed_cras` table: it
duplicates information the document already carries, and it introduces a lifecycle — when is a key
expired, what happens when the stored response goes stale — for one route. **Threshold**: the second
route that needs a key, or the first one whose result is not a row it can be read back from.

**Requiring the header and not storing it** — validate the shape, log it, discard it. Half a line
shorter and completely inert: every test would still pass, the header would appear in the README,
and the first real retry would issue a second document. Naming this as the rejected option matters
more than the mechanism, because it is the version that gets shipped by accident.

**Making the header optional.** Friendlier to a caller experimenting with `curl`. It loses because
the one request in this API that must not be replayed blindly is precisely this one, and an
optional guard is off by default for the client most likely to retry.

**Answering `409` on replay instead of `200`.** Defensible, and wrong per ADR-0021: a retry is not
a conflict, it is the same request arriving twice, and a client that gets a 409 cannot tell whether
its first attempt succeeded.

## Reconsideration threshold

Reopen when a second POST allocates something scarce — a credit note taking the next number in the
same series is the obvious candidate (ADR-0018). Two routes sharing this mechanism is the point at
which the dedicated table stops being over-engineering.

Reopen if a key must expire. Nothing here does: the instance resets nightly (ADR-0032) and a key
lives exactly as long as the document it issued. A retention rule would make the column a lifecycle
rather than a fact.

## Consequences

The header does something, and an integration test proves each of the three behaviours — same key
replays, a different key on an issued document conflicts, an absent key is refused.

The series stays gapless under a retry, which is the property ADR-0007 bought with a locked counter
row and which a client-side retry could otherwise defeat from outside.

The cost is one nullable column and one partial index on a table that already has many of both, and
a caller that must now hold a key across a retry — which is the whole point, and which
`docs/demo.md` will show.
