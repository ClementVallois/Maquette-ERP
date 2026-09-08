# ADR-0120 — The construction journal leaves the public repository

- **Date**: 2026-09-08
- **Status**: accepted

## Context

This repository accumulated a second body of writing alongside the deliverable: the record of how it
was built. Nine files, roughly 8 000 lines — the request log, the QA round index, two product
working notes, a phase-closure record, a printable-sunset argument, a set of round-6 notes, the
vulnerability-management procedure, and 4 650 lines of phase checkpoints inside
`docs/open-questions.md`.

They were written for one reader who had the whole context, and they read that way. Three properties
made them a liability in a public repository rather than an asset:

- **They quote conversations the reader cannot reach.** Two of them anchored themselves in a brief
  given verbally, one reproduced requests verbatim as they were spoken, and one repeated a third
  party's internal tooling — not this repository's to publish.
- **They address a person, not a reader.** « document de pilotage adressé à Clement », « ce qu'on
  ouvre depuis un téléphone en entretien ». A public reader decodes those without a brief, which is
  exactly the failure `.claude/agents/cold-reader.md` exists to catch.
- **They rot fastest and are checked least.** A retrospective is written once and never re-read
  against the tree. The blind reviewers run before every merge found stale claims in them at a rate
  the code and the ADRs do not match.

What they were kept for is real: they are the evidence that arbitrations were held rather than
improvised. That evidence survives without them — the ADRs record every structural decision with its
rejected option, and `docs/open-questions.md` keeps its Open table, which is the part that describes
the present rather than the past.

## Decision

**The construction journal is withdrawn from the tree, kept privately, and gitignored** so a stray
`git add .` cannot restore it. `docs/open-questions.md` is reduced to its Open table plus the
checkpoint for this change; the file keeps its name, its purpose and its 121 inbound citations.

Every reference that asked a present-tense reader to go and open one of these files was rewritten to
carry its statement on its own dated authority — **with the exception of the ADRs, which cite rows
and sections of `docs/open-questions.md` by date**. Those are left standing as dated provenance, and
that file's own header now says so once rather than 121 times. A first pass of this change claimed
the sweep was complete and it was not: `README.md` and `docs/running.md` each still carried one, both
found by the blind cold reader and fixed before merge.

**On the numbering.** This ADR is 0120 and the previous accepted one is 0101. The gap is not a
withdrawal: 0102–0119 exist on an unmerged branch (`chore/clean-up-audit`) and arrive with it. The
rule in `docs/adr/README.md` — numbering is never reassigned — is why the gap is left rather than
closed.

**This is deliberately not ADR-0014's disposition, and the difference is stated rather than
glossed.** ADR-0014 purged `CHOIX.md` from history — it is unrecoverable. These files are removed
from the tree only: `git show <commit>:docs/todo.md` still returns them, and the pull requests that
introduced them still render their diffs. ADR-0014 named its own window explicitly — before the
first merge to `main`, while the repository was private and no pull request had been opened — and
that window closed on 03/09/2026. Anyone who reads the claim "withdrawn and kept privately" should
read it as "removed from every normal reading path", not as "erased".

## Rejected options

**Keep them, and say so** — ADR-0014's own rejected option, and it has the same merit here: 8 000
lines of recorded reasoning is evidence of the work a reviewer is trying to assess. It loses for the
reason ADR-0014 gave and for one more: the material is not all this repository's to publish, and
that half cannot be fixed by framing it better.

**Purge them from history as well.** The complete fix, and the one this ADR would have taken had the
window still been open. Rejected on measurement: the earliest affected blob is 579 commits back, and
this repository's documents cite 178 short commit hashes of which 171 resolve. A rewrite from the
confidential material dangles **89** of them; a rewrite covering every mention dangles **171**.
`git filter-repo` remaps hashes in commit messages, never inside file contents, and repairing the
citations would edit the documents and change the hashes again — there is no fixpoint. Trading three
product names for 89 to 171 dead `git show` references, in a repository whose whole claim is that
its assertions are checkable, is a worse repository. A rewrite would also not finish the job on its
own: GitHub retains the pre-rewrite objects on merged-pull-request views until it garbage-collects.

**Translate them into English and keep them** — the option `docs/open-questions.md` carried as open
since 05/09/2026 for the two French notes. Moot: it prices the language problem, and the language was
never the reason they had to go.

## Threshold at which we would change our mind

**A reviewer asks for the construction record.** It exists, it is complete, and it is one file
transfer away. That is a better answer than publishing it pre-emptively, and it is the answer this
ADR is designed to leave available.

**Anything in the withdrawn material turns out to be load-bearing for a claim this repository still
makes.** One case was found while writing this ADR and fixed rather than deferred: ADR-0075 decided
_where_ the vulnerability-management procedure lives, and its address moved — corrected in place,
per ADR-0045, in that ADR's own text.
