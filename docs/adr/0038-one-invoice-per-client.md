# ADR-0038 — One validated `Cra` drafts one invoice **per client**

- **Date**: 2026-08-18
- **Status**: accepted

## Context

The chain this repository exists to demonstrate is stated everywhere in the singular: a consultant
records a `Cra`, a manager validates it, **and that validation triggers the generation of a draft
invoice**. `CLAUDE.md` says it that way, the README says it that way, and the reserved subject of
ADR-0021 says "validating the same Cra twice does not produce two invoices".

The model does not support the singular, and Phase 2 is where that surfaced. A `Cra` covers a month;
a month is worked across missions (`CraLine` carries its mission for exactly that reason); and a
mission is sold to a client. Nothing anywhere constrains a consultant's month to one client — and
the dataset `CLAUDE.md` prescribes, with five practices and both billing models, makes the opposite
ordinary. An auditor spending March half on a bank's PASSI engagement and half on an insurer's GRC
review is a normal month, not an edge case.

An invoice is addressed to one client, carries that client's SIREN and address as mandatory
mentions, and resolves its VAT from that client's territoriality. There is no such thing as an
invoice for two clients. So the singular was never a simplification: it was an unexamined
assumption, and it had to be resolved before the drafting function was written rather than
discovered by whichever client got billed for the other's days.

## Decision

**Drafting returns a set.** One validated `Cra` produces **one invoice per distinct client** among
the missions it worked, and `draftInvoicesFrom` returns `readonly Invoice[]` — empty when nothing in
the month is billable (ADR-0037), one element in the common case, more when the month spans clients.

The grouping key is the **client**, not the mission: two `Regie` missions sold to the same client
produce one invoice with two lines, which is what a client expects to receive and what the VAT
recapitulative per rate is built to summarise.

The consequence is handed forward explicitly rather than left for Phase 3 to trip over:
**ADR-0021's idempotency is owed over the set.** "Validating the same Cra twice does not produce two
invoices" has to mean "does not produce a second _set_" — a guard that keys on the Cra alone and
stores one invoice id will silently drop the second client's invoice on the first validation and
recreate it on the second.

## Rejected option

**One invoice per `Cra`, with lines for every client on it.** The literal reading of every document
in the repository, and the reason this ADR exists. It loses on the document itself, not on taste: an
invoice names one customer, and the reform makes the customer's SIREN a mandatory field. A document
with two customers is not a badly-formatted invoice, it is not an invoice. It would also make the
VAT recapitulative meaningless, since territoriality is a property of the client.

**One invoice per mission.** Also defensible, and it is what some firms do when each mission has its
own purchase order. It loses here because a client with three concurrent missions would receive
three documents a month for one relationship, and because it makes the per-rate recapitulative — the
grouping the fiscal rule requires — trivially one line per document, which removes the invariant
this build wants to demonstrate. It is worth reopening the day a purchase-order reference becomes a
mandatory mention, since a PO is per mission.

**Refusing to validate a `Cra` that spans two clients**, pushing the split back onto the consultant.
Briefly attractive because it restores the singular. Rejected because it makes the tool refuse a
correct record of a real month — the same mistake ADR-0037 rejected for `Forfait` days, and the
README's opening paragraph is precisely about a tool that forces re-entry.

## Reconsideration threshold

Reopen when a **purchase order or a framework agreement** becomes a mandatory mention: a PO is
negotiated per mission, and an invoice that must carry one cannot merge two missions. That flips the
grouping key from client to `(client, purchase order)`, which is a change of key rather than of
shape — the set is already a set.

Reopen also if an invoice ever has to be **split by period** as well as by client (a mission crossing
a fiscal year with different rates on either side). The document already refuses a line worked in a
month other than the one it covers, so the key would become `(client, period)` and the same shape
holds.

## Consequences

The demonstration is honest about the domain: the screen of Phase 6 shows a manager that validating
one month produced two documents, and the number is right.

The costs are two, and both are real. Every caller handles a collection where the prose led it to
expect one object — the README's own sentence, "cette validation déclenche la génération d'un projet
de facture", is now a simplification of the common case rather than a statement of the model.
And Phase 3's idempotency is harder than the reserved ADR-0021 subject implies: the natural
implementation, a unique key on the `Cra`, is wrong.
