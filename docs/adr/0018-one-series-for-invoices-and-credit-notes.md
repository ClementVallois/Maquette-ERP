# ADR-0018 — One number series for invoices and credit notes, keyed `(entity, fiscal year)`

- **Date**: 2026-08-18
- **Status**: accepted

## Context

An invoice number is not an identifier the software chooses for its own convenience: it is a legal
attribute. French law requires it to follow a **continuous chronological sequence with no gap**, and
the sequence is what an audit reconstructs the firm's revenue from. A missing number has to be
explainable; an unexplainable one is a presumption of a document that was destroyed.

Two questions have to be answered before the first document is issued, because both are
unrecoverable afterwards.

**What is the counter per?** The obvious answer is the year. It is also the one that cannot be
changed: the day the firm has a second issuing entity — a subsidiary, a foreign branch, an entity
created for one large client — a series keyed on the year alone has to be split, and splitting it
renumbers documents that have already been sent. Every alternative at that point is worse than the
last: renumber history, restart from a number that leaves a gap, or run two entities through one
counter and lose the ability to say which sequence is continuous.

**Do credit notes share it?** A credit note is a fiscal document of the same family, subject to the
same numbering requirement. Giving it its own series is legal and common. Giving it the invoice
series is also legal, and it buys something the separate series cannot: one chronological order over
everything the firm issued.

## Decision

**One series, shared by invoices and credit notes**, keyed on **`(entityId, fiscalYear)`**. The
number is written `SEC-2026-000042` — the entity's prefix, the year, and a six-digit sequence — and
it carries **no mark of which kind of document it numbers**.

The kind is the document's own, which is the same rule ADR-0036 applied to amounts: a credit note
carries positive figures and its type carries the direction. A `FA-`/`AV-` prefix pair would be two
counters wearing one name, and "chronological continuity" would become a claim nothing enforces.

The fiscal year is the calendar year today. It is named "fiscal" rather than "calendar" because the
two part company the day the firm closes on another date, and by then the key is in the data.

This file holds the **shape** of the series and of the number. The allocation that makes it gapless
under concurrency — a row locked with `SELECT … FOR UPDATE` inside the issuing transaction, never a
Postgres `SEQUENCE`, because `nextval` is not transactional and a rollback leaves a hole — is
**ADR-0007**, in Phase 3. Separating them is deliberate: the shape is a domain decision testable
without a database, the allocation is an infrastructure decision that is not.

## Rejected option

**A series per document kind**, `FA-2026-…` and `AV-2026-…`. The most common arrangement in the
wild, and it reads better on a page. It loses on the property this build claims: with two counters
there is no single order in which the firm's documents were issued, so "sequential and gapless" has
to be asserted twice and reconciled by hand at audit. It also doubles the row that Phase 3 locks,
and two locks are where the deadlock lives.

**Keying the series on the year alone.** One less field, and correct for as long as there is one
entity. It loses on cost asymmetry, the same argument ADR-0013 made for the polymorphic line: the
field costs nothing now and the retrofit is paid over documents that are legally immutable.

**Keying it on the year and the month**, which some firms do for volume. Rejected because it
multiplies the number of counters by twelve for a mockup that issues tens of documents, and because
a monthly reset makes a gap at a month boundary indistinguishable from a document that was never
issued.

**A UUID as the legal number.** Unique, no counter, no lock, and no series to keep continuous. It is
simply not lawful: the sequence has to be chronological and continuous, and a random identifier is
neither. Recorded because it is the answer a reader who has not met the constraint will propose, and
because the internal id **is** a UUIDv7 — the two are separate fields on purpose.

## Reconsideration threshold

Reopen on a **second issuing entity**, which is what the key is there to absorb — the change is then
data, not code. Reopen on a **fiscal year that is not the calendar year**, which changes how the key
is derived from the issue date and nothing else.

Reopen the shared series if the firm's accountant requires separate ones, or if a jurisdiction the
firm invoices from requires it. That is an external constraint rather than a design change, and the
threshold is written here so that the answer is "we chose this, here is what it would cost" rather
than an improvisation.

## Consequences

There is one chronological order over everything the firm issues, and one counter to lock. Phase 3
locks a single row per `(entity, fiscal year)`.

The cost is that a reader cannot tell an invoice from a credit note by its number — a habit French
accounting has, and one this decision deliberately breaks. The document says which it is, in a field
and on the page. That is the same trade ADR-0036 made, and making it twice consistently is the
point: the sign, the kind and the number are three separate facts, and only one of them is the
number's job.
