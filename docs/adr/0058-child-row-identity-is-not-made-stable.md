# ADR-0058 — Child-row identity is not made stable, and the threshold is named

- **Date**: 2026-08-21
- **Status**: accepted

## Context

ADR-0041 made every identifier a UUIDv7 generated in the application, child rows included. Its
§ Consequences originally claimed "child-row identity is stable: reordering lines does not rewrite
ids". That was never true of the code — `save` does `DELETE` + `INSERT`, so every re-save mints a
fresh id for every line, flag and VAT group — and the sentence was **corrected in place** on
21/08/2026 under ADR-0045, which distinguishes a false description from a changed decision.

Correcting the sentence left the question. `docs/open-questions.md` carries it as a separate row:
the claim was brought into line with the code, and nobody has decided whether the code should
change. The row named this task, and named why it was filed next to the credit-note row: "the two
share a cause — the first thing that would reference a child id would be a credit note on a line —
and would otherwise be answered twice."

**ADR-0057 has now removed that cause.** No credit note is persisted, so nothing in this repository
will reference an invoice line by id. The remaining question is whether to build stability anyway.

## Decision

**Child-row identity stays unstable across a re-save, deliberately, and this ADR is where that is
a decision rather than an omission.**

Two things hold it in place, and they are different in kind:

- **Nothing references a child id.** Not the domain, not a route, not a screen, not an export, not
  the seed. The three child tables — `timesheet.cra_lines`, `timesheet.cra_flags`,
  `billing.invoice_vat_groups` and the invoice lines — are always read as part of their parent and
  never addressed on their own. An id nothing addresses cannot be stale.
- **The parent rows that matter are immutable anyway.** A `Validated` Cra cannot be re-saved with
  different lines (ADR-0005), and an issued `Invoice` is never modified (ADR-0007, ADR-0036). So
  the churn is bounded to documents still being edited, which is exactly the population for which a
  stable line id has no meaning: a line the consultant deleted and retyped is a different line.

**What is required of the code today**: nothing changes. `save` keeps replacing children, and
ADR-0041's injected factory keeps minting valid v7 ids for them — which is what makes the switch
below a change to one method rather than to a format.

## Rejected option

**Deliver the stability now**: round-trip child ids through `reconstitute`, and make `save` diff
against what is stored instead of replacing it. Perhaps two hours of work, and it discharges an
ADR's stated consequence rather than narrowing it.

It loses on the sorting criterion this repository names out loud. It is a mechanism built for a
caller that does not exist and, after ADR-0057, has no path to existing here — the definition of
what YAGNI rejects. And it is not free: a diffing `save` has to decide what "the same line" means
in the absence of a natural key, which is the very question a stable id would answer. Getting that
wrong is worse than replacing, because it produces a line whose id is stable and whose content
silently drifted.

**Give the child rows a natural key instead** — `(cra_id, day, mission_id)` for a line — and drop
surrogate child ids entirely. Genuinely attractive: it makes identity a fact about the data rather
than about the insertion order, and it would make a diffing `save` trivial. It loses because it
contradicts ADR-0041 at the format level rather than at the mechanism level, and because the key is
wrong for the other two tables — a VAT group's identity is its rate, a flag's is its day, and a
single rule would not cover the three. That is a bigger decision than the problem in front of it.

## Reconsideration threshold

Reopen at the **first thing that addresses a child row on its own**. Three shapes, and any one of
them is enough:

- a credit note issued against one line rather than the whole invoice — which is ADR-0057's
  threshold, reached from here;
- an export, a webhook payload or an API projection that publishes a line id to something outside
  this process, at which point the id becomes a promise;
- a screen that links to a line — an anchor, a per-line action, a comment.

The work at that point is what the rejected option describes, and it is a change to `save` and
`reconstitute` in two repositories. It is **not** a change to the id format, and that is the whole
value ADR-0041 bought: the migration this decision defers is a mechanism swap, not a rewrite of
every identifier in the database.

## Consequences

**Easy.** No change to any repository, and one fewer half-built mechanism. The claim in the
codebase is now exactly what the code does, in ADR-0041's corrected § Consequences and in this ADR
together — which is what the open-questions row asked for and what it could not get by staying
open.

**Expensive.** A re-save of a draft rewrites its children's ids, so anything that ever caches a
child id — a browser anchor, a log line someone kept, a debugging note — becomes wrong silently
rather than loudly. That is acceptable exactly while the list above is empty, and the list is what
has to be checked before it stops being.
