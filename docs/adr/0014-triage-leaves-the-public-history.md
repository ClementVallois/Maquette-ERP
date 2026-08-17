# ADR-0014 — The working triage leaves the public history

- **Date**: 2026-08-17
- **Status**: accepted

## Context

`CHOIX.md` is the document this repository was designed from: 210 KB and 478 rows inventorying every
subject raised for the ERP — technical and business, a `.npmrc` setting and an NIS2 obligation on the
same line — each one carried to a verdict. It did its job. Its conclusions are already elsewhere:
the retained rows became `docs/BUILD-RULES.md`, the rejected and deferred ones became the README's
"Ce que je ne construis pas", and the structural ones became the ADRs in this directory.

It is also tracked on three pushed branches, in French, unsorted, and this repository is going
public. Two facts decide the shape of the problem:

- **`git rm` removes a file from the tree, not from the history.** A reader running `git log -p`
  finds every version of it. Deleting it and moving on would be a deletion that only looks like one.
- The window closes at the first merge to `main`. After that the history is entangled with the
  branch the deliverable is read from, and rewriting it costs more than it is worth.

`docs/open-questions.md` recorded this as row 3 on 17/08/2026 with three named options. This ADR
settles it.

## Decision

**`CHOIX.md` is purged from the history of all three branches before the first merge to `main`, and
survives in a separate private repository** (`Maquette-ERP-notes`) together with `draft.md` and
`scripts/extract-triage.ts`, the script that counts its verdicts row by row.

`draft.md` needs no purge: it was gitignored from the start and was never committed — verified,
`git log --all -- draft.md` is empty. It is archived rather than rewritten out, because a verbatim
third-party post with no attribution has no place next to a public repository either way.

The seven commits that touch only `CHOIX.md` disappear with it. A commit message describing a file
nobody can open is the same defect as a section reference nobody can follow.

## Rejected option

**Keep it, and say so** — the option with real merit, and the one that fits this repository's habit
of making its omissions explicit. 478 arbitrations with their reasons are evidence of exactly the
work a reviewer is trying to assess, and hiding them looks like having less to show.

It loses on the reader, not on the content. The first thing a cold reader meets would be a wall of
untriaged internal French notes at the top of a directory listing, in a deliverable whose entire
claim is that it explains itself without a brief. The material is _pre-decision_ by construction: it
mixes scales deliberately, and half of it is thinking-out-loud that the ADRs and the README have
since replaced with a defensible version. Publishing the draft alongside the finished argument does
not add evidence — it invites the finished argument to be read as one option among several.

The evidence survives anyway, in the form that carries: the README's "Ce que je ne construis pas"
publishes the rejected and deferred rows with their thresholds, which is the part that demonstrates
judgement. What leaves is the unsorted version of it.

**Rewrite the history but keep the file untracked locally** — rejected as the same decision with the
backup left to chance. If the document is worth keeping, it is worth keeping somewhere with a remote.

## Consequences

Nothing public may cite `CHOIX.md` by section number: a cold reader cannot open it. `BUILD-PLAN.md`
names decisions by subject and by ADR instead, and its coverage appendix keys to row titles with the
private repository named as their source.

The same applies to commit SHAs, and it is sharper than it looks: **the rewrite changes every SHA
after the first purged commit**, so a document citing one is a reference that survives the file it
points at. Checked across every tracked document — the only SHAs left are in this plan's own
description of the purge, naming the seven commits that disappear with the file and the checkpoint
ref deleted before it runs. Those are a record of what was removed, not a pointer to something
expected to still be there. Everything else cites commits by what they did.

The purge is only complete while two facts hold, and both must stay true until it lands: the
repository is **still private**, and **no pull request has ever been opened** — GitHub keeps
`refs/pull/N/head` forever, so a single PR opened beforehand would defeat it. Both verified
17/08/2026.

The cost is a force-push across three branches, and a rewrite that invalidates every clone. There is
exactly one clone, and no pull request. This is the cheapest this operation will ever be, which is
why it is Phase 0 task 1 rather than a cleanup at the end.

## Reconsideration threshold

Reopen if the triage itself becomes the artefact under review — if a reader is being asked to assess
the _method_ of inventorying and arbitrating a domain rather than the code that came out of it. Then
the document is the deliverable and belongs in the open. Publishing it later is a paste; unpublishing
it later is not available, which is why the order matters.
