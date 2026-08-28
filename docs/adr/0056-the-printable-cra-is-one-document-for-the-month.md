# ADR-0056 — The printable Cra is one document for the month, whatever it spans

- **Date**: 2026-08-21
- **Status**: accepted

## Context

`docs/BUILD-PLAN.md` § 6.5 asks for "the validated Cra as a printable page for client signature —
near-zero cost in CSS, and it is the document that unblocks billing at large accounts". The last
clause is the reason it exists: at a large account, the purchase-order process will not pay an
invoice that is not backed by a countersigned record of the days delivered, so this page is what
turns a validated month into money.

Writing it surfaces a question the model has an answer to and the document does not: **who signs
it.** A `Cra` is monthly and per consultant; a month is worked across missions (ADR-0038 is the
same fact seen from the other side, which is why one validation drafts one invoice _per client_).
So a single month can carry days sold to two different clients, and "the client" is not a field of
a `Cra`.

Two further facts constrain the answer. The days on a `Forfait` or internal mission — `Intercontrat`
is one (ADR-0046) — are on the `Cra` and are billed to nobody. And a client is entitled to see the
days delivered **to them**, not the consultant's whole month: what else that person worked on is
not theirs to know.

## Decision

**One printable document per `Cra`: the month as recorded, signed by whoever receives it.**

- **The signature block is generic** — a name, a date, a signature, with no client printed into it.
  The document states the consultant, the office, the period and the days; who countersigns is a
  fact about the errand, not about the record.
- **Every status renders**, and a `Cra` that is not `Validated` carries a notice saying it is not a
  signable record — the same shape as the invoice draft notice (ADR-0055), and for the same reason:
  one renderer, so a document cannot lose a field on the path nobody looks at.
- **It shows the whole month**, including absences and days on non-billable missions, because it is
  a record of working time and a record with the inconvenient rows removed is not one.
- **All three roles may open it**, and the repository scopes it: a consultant reads their own
  (`cra: 'own'`), a manager and billing read their office's (ADR-0023). No new authorization
  question, and therefore no second place the rule could be forgotten.

## Rejected option

**One printable Cra per client — the month filtered to the days sold to them, addressed to them.**
This is what a firm actually sends, it solves the confidentiality point above, and it is what
"for client signature" most naturally means.

It loses **here** and the reason is scope rather than correctness. Filtering the month by client
means resolving each line's mission to a client, which is `billing`'s projection — so the document
would either import `billing` into a `timesheet` screen or join at the composition root a second
time, for a page nothing else needs. And the confidentiality argument it wins is not live in this
mockup: nothing is dispatched (the README's "Ce que je ne construis pas" says so), so no client
receives this page and no consultant's month is exposed to one. Building the split now would be
speculative code with a real cost, and the sorting criterion here is YAGNI.

**Refuse to render a `Cra` that is not `Validated`.** Defensible — the document exists to be signed,
and an unvalidated month is not signable. It loses because it makes the screen useless in exactly
the situation a consultant would reach for it: checking what the month looks like before submitting
it. A notice says the same thing without removing the page, and it is what ADR-0055 already does
for a draft invoice.

## Reconsideration threshold

Reopen the day the page is **sent** rather than printed — a download link, an email, a client
portal. At that point the confidentiality argument becomes live: a client receiving a month that
names another client's mission is a disclosure, and the per-client split stops being speculative.
That is the same threshold ADR-0055 names for the invoice, reached from the other document.

Reopen sooner if a client's purchase-order process demands their own reference or contract number
on the record. That is a field of the _client relationship_, not of the month, and it would make
the generic signature block untenable.

## Consequences

**Easy.** No new port, no new query, no cross-module join: the page is the aggregate `findById`
already returns, plus the mission names the pré-facturier already reads. The print rules are the
ones ADR-0055 wrote.

**Expensive.** The document is not the one a large account would actually countersign: it shows a
consultant's whole month, so a client signing it sees the existence of missions that are not
theirs. The mockup never sends it, which is what makes that acceptable today and exactly what the
threshold above watches for.
