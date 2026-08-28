# ADR-0060 — The screens name a refusal in French, keyed by its `type`

- **Date**: 2026-08-21
- **Status**: accepted

## Context

`docs/open-questions.md` records, from walking task 6.4 on a running instance: the denied page
renders `ProblemDetails.title` — "This role does not carry this action" — in bold, under the French
heading "Accès refusé", next to a French `detail`. ADR-0026 decided **one** screen language, with
every visible string centralised in `labels.ts` so a non-developer can read the wording as a whole.
A sentence arriving from the API's error vocabulary is neither in that file nor in that language.

It is not a rough edge. The denied page is the page this repository's third claim is checked on —
authorization by role **and** by scope — and it is therefore the page a reader looks at hardest.

The constraint that makes it interesting is that `title` is **right** where it lives. ADR-0009 and
`http/reply.ts` decided that a screen renders the **same `ProblemDetails` object** the API would
have returned, precisely so that the refusal a reader sees and the one `curl` reproduces are the
same refusal. `title` is part of that object, and `BUILD-RULES` § Working discipline says everything
is English except `README.md`. Translating it at the source would make the API French.

## Decision

**The page renders a French sentence chosen by `problem.type`, and never `problem.title`.**

- **The sentences live in `labels.ts`**, in one table keyed by the problem type — the same key
  `http/problem.ts` uses for the status, so the two tables are read together and a refusal that
  gains a status without a sentence is visible next to the one that has both.
- **`type` stays on the page**, in the facts list, exactly as it is on the wire. It is the
  machine-readable half and the thing to quote in a report; the French sentence is the human half.
  Neither replaces the other, and `deniedBy`, `invariant` and the correlation id are unchanged.
- **A type with no sentence falls back to the heading for its status**, not to the English title.
  A fallback that renders English is the defect this ADR removes, so it cannot be the safety net.
- **A test makes forgetting loud.** `problem.test.ts` already reads every `problemType` literal out
  of `packages/` and asserts each has a status; the same list is now asserted to have a sentence.
  A module adding a refusal in a later phase is found by that test on the day it is written.

## Rejected option

**Translate `title` at the source — make the API answer in French.** One field, one language, no
table. It loses on who reads what: `/api/v1` is a code interface and its vocabulary is code's
(ADR-0026 draws exactly this line for the URLs, French on the screens and English under `/api/`).
A French `title` on the wire would also be the first French identifier in a document whose whole
point is to be branched on by `type` — and a caller that branched on the sentence would break the
day the wording improved.

**Render `detail` instead of `title`.** It is already French on several routes, which is what makes
this tempting. It loses because "already French on several routes" is the problem: `detail` comes
from `error.message` for every domain refusal, and those messages are English by BUILD-RULES and
are written for a developer reading a log. The page would be French where somebody happened to
write French, which is an accident wearing a decision's clothes.

**A generic French sentence per status — one for 403, one for 409, one for 422.** Cheap, and the
headings already do this. It loses on the only thing the denied page is for: "Accès refusé" and
nothing else proves nothing, while "votre rôle ne porte pas cette action" and "cet enregistrement
est hors de votre périmètre" are two different refusals from two different loci (ADR-0023), and
telling them apart is the demonstration.

## Reconsideration threshold

Reopen at a second screen language. The table is keyed and centralised, so a second language is a
second table — but the fallback, the heading map and the test would all need a locale, and that is
a bigger change than adding a column. ADR-0026's own threshold (a non-French-speaking user of the
target ERP) is the one that applies.

Reopen also if a refusal ever needs a sentence that depends on its **fields** rather than only on
its type — "the mission ended on 12/03" rather than "this mission is not running". That is a
template with holes filled from `errors`, which is a different mechanism from a lookup and should
be decided as one.

## Consequences

**Easy.** One language on the screens, in one file, checkable by reading it. The API is untouched:
the same object still crosses to both representations, and `curl` still gets the English `title`
a developer wants. The exhaustiveness test that already existed for statuses now covers wording,
so the gap this ADR closes cannot silently reopen.

**Expensive.** Two tables keyed on the same strings, in two files — `http/problem.ts` for the
status and `web/labels.ts` for the sentence. They are deliberately not merged: the status is a
transport decision (ADR-0042) and the sentence is a screen decision (ADR-0026), and a module's
refusal has a status whether or not any screen ever renders it. The test is what keeps them in
step, and it is the reason the split is affordable.
