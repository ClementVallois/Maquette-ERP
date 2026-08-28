# ADR-0057 — A `CreditNote` is a domain rule here, and not a stored document

- **Date**: 2026-08-21
- **Status**: accepted

## Context

`docs/open-questions.md` has carried this row since 19/08/2026: **`billing.credit_notes` is created
by migration 003 and read by nothing.** Phase 5 was assigned the row and resolved half of it —
`billing.declined_days` gained a writer, a reader, an office and a natural key. `credit_notes`
gained neither, and the row named this task as the one that decides, "because the printable invoice
is the first screen on which a correction is a visible action".

The row states the cost precisely, and it has two halves.

**One unused table, in a repository that names YAGNI as its sorting criterion.** Nothing writes it,
nothing reads it, no test touches it, and the README claims in the present tense that "la seule
correction d'une facture émise est un avoir" — which is true of the **domain** and not of the
persistence.

**And a numbering claim the schema contradicts.** ADR-0018 decided one series holds invoices and
credit notes together, for chronological continuity. `billing.invoices.invoice_number` and
`billing.credit_notes.document_number` carry **independent** `UNIQUE` constraints, so the schema
permits an invoice and a credit note to share a number. One series enforced by two indexes is not
one series.

The task is now here, the invoice screen exists, and a correction is not an action on it.

## Decision

**The credit note stays a rule of the domain and stops being a row of the schema.** Three parts:

- **`billing.credit_notes` is dropped** (migration 010). It has never held a row on any instance —
  the seed does not write it and no code path can — so this is not a data-loss migration, and the
  additive rule below is where that is argued.
- **The domain keeps `CreditNote`, `CreditNoteReason` and `Invoice.cancelByCreditNote()`**, because
  they are not the same kind of thing as the table. They carry the invariant `docs/BUILD-RULES.md`
  states first about an issued invoice: **it is never modified**, and the only exit is a document
  that reverses it in full with a typed reason. That invariant is enforced — `issue` refuses a
  second transition, `cancelByCreditNote` refuses anything but an issued invoice, and both have
  tests. A rule the code refuses to break is not speculative code; an empty table is.
- **The README says so**, in the "Ce que je ne construis pas" table, with the threshold. The
  existing "Undo sur une facture émise" row is corrected in the same pass: it says the only
  correction is an `avoir`, which now needs to name where that is true.

**What this does to ADR-0018, said plainly rather than left to read as "fixed".** Dropping the
table removes the counterexample; it does not supply a witness. One shared series is still decided
and still implemented — `seriesKeyOf`, `sameSeries`, `documentNumber` and the locked counter row
carry it, and the counter is keyed on `(entity, fiscal year)` and not on the kind of document. But
after this migration nothing in the **schema** can demonstrate it, because there is only one kind
of document left to number. The claim becomes domain-only, and that is a narrowing, not a proof.

## Rejected option

**Build it: a `CreditNoteRepository`, an issuance path, and a button on the invoice screen.** It is
the option the open-questions row put first, and it has a real argument — the correction is the
half of the immutability story a reader can actually watch happen, and a mockup that says "an
issued invoice is never modified" is more convincing when it shows what happens instead.

It loses on what building it costs against what it proves. The chain this repository exists to
demonstrate is CRA → validation → invoice; a correction is downstream of it, and `CLAUDE.md` says
in as many words that a mediocre mockup is worse than none and that scope is cut rather than
half-built. Building the persistence honestly means the shared-series lock exercised by a second
document kind, a reason captured in the UI, the invoice's status transition persisted, and the
`assertDocumentAddsUp` gate on a reversing document — a phase of work, at the end of a phase, for a
screen nobody has asked to see. Half-building it is worse: a table written by one path and read by
none is what this ADR exists to remove.

**Keep the table and write the decision down without dropping it.** The smallest change, and it
respects `docs/BUILD-RULES.md` § "Migrations are additive" without argument. It loses because it
resolves nothing: the row's complaint _is_ the unused table, and answering it with a paragraph
leaves the next reader finding the same table and the same absence of a reader. It also leaves the
two independent `UNIQUE` indexes standing under ADR-0018, which is the part that is not merely
untidy but wrong.

**On the additive rule.** It is a real rule and this is a real exception, so it is argued rather
than waved past. The rule exists so that a migration cannot destroy data a running deployment
holds. Nothing is deployed (Phase 8 is where that changes), no instance has ever written this
table, and the seed cannot. The exception is therefore bounded to "a table that has never held a
row", and it is not a licence: a `DROP` touching a table with a writer is the thing the rule
forbids and this ADR does not reopen.

## Reconsideration threshold

Reopen the day an issued invoice needs correcting on an instance — a demo that has to show a
cancellation, a wrong rate discovered after issuance, the first real user. That is the same
threshold ADR-0055 and ADR-0056 both name from their own side (the first document that is _sent_),
because a document nobody received needs no credit note.

At that point the work is: a migration recreating the table with the shared-series constraint
expressed as **one** index over both kinds — which is the shape ADR-0018 always described and which
this ADR is deliberately not building in advance — a repository, and a reason captured at the point
of correction.

## Consequences

**Easy.** The schema holds no table without a reader, and `pnpm run boundaries` plus a `grep` are
enough to say so. ADR-0018's one-series rule is enforced in exactly one place instead of being
contradicted in a second. The README stops claiming a persistence that does not exist.

**Expensive.** The immutability of an issued invoice is now demonstrated only by refusal — the
transition throws — and never by showing the document that legitimately reverses it. That is a
weaker demonstration than the alternative would have given, and the threshold above is where it
stops being good enough.

**And one row of `docs/open-questions.md` is answered by another ADR in the same commit.** The
child-row identity question (ADR-0041's undelivered consequence) was filed alongside this one
because "the first thing that would reference a child id is a credit note on a line". This decision
removes that cause, and **ADR-0058** takes the consequence.
