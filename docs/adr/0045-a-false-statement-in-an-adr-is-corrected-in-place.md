# ADR-0045 — A false statement in an ADR is corrected in place; a changed decision is superseded

- **Date**: 2026-08-21
- **Status**: accepted

## Context

`docs/BUILD-RULES.md` has said since Phase 0: "an ADR is never rewritten — a changed decision gets
a new one that supersedes it." The rule is right about what it was written for. It turns out to be
wrong about something else, and the closure of Phases 4 and 5 is where that surfaced, because three
ADRs were found to contain statements that were **never true**:

- **ADR-0023** § Decision gives `billing` `none` on a column headed "`Tjm`, `Cjm`, margin", while
  `GET /api/v1/invoices/:id` serves `unitPriceCents` and `origin.tjmCents` to `billing`. The route
  is right — billing cannot issue a document whose rate it may not read — and the matrix collapsed
  three values into one column whose justification is entirely about **cost**.
- **ADR-0041** § Decision says the generator lives in `scripts/lib/` and "the repositories import
  from `scripts/lib/`", which **cannot happen**: `rootDir` is `src` in every package, so the climb
  fails the per-package `tsc --noEmit` the `quality` job runs. Its § Consequences claims child-row
  identity is stable across a re-save; `save` does `DELETE` + `INSERT` and mints fresh ids.
- **ADR-0043** § Consequences calls `apps/api`'s SQL "read-only, `public.*` only, two files". It is
  three files and one of them writes `INSERT INTO public.domain_events`.

None of these is a decision that changed. In all three the code is right and was right; the
sentence describing it was wrong when it was written.

Applying the never-rewrite rule to them produces an ADR whose Decision section states one thing and
whose appended note states the opposite, and a reader has to reach the bottom to find out which
half is operative. Three of those in a directory of forty-five is how `docs/adr/` stops being
readable as a set of decisions.

## Decision

**The test is whether the decision moved.**

- **A decision that changed gets a new ADR that supersedes the old one.** Unchanged, and this is
  the case the original rule exists for: the old decision was really taken, it was really operative
  for a while, and erasing it hides that the thinking moved. ADR-0019 superseding a BUILD-RULES
  line in Phase 3 is the shape.
- **A statement that was never true is corrected in place**, in the section that carries it, with
  no note and no strikethrough. **These files are decisions, not logs.** The ADR's job is to say
  what is decided and why the alternative lost; a corrective appendix makes the current decision
  harder to read than the wrong sentence did.

**What is never edited**: the number, the date, the Status line, the rejected option, and the
reconsideration threshold. Those are the record of when and against what the decision was taken.
Only a description of the code may be brought into line with the code.

**The correction is visible in git**, which is the log this ADR declines to keep in the file. A
commit that touches `docs/adr/` and is not a new ADR says what was false and what made it false.

## Rejected option

**Keep the absolute rule, append a superseding note to each of the three.** It is what
`BUILD-RULES.md` said until today and it has one real advantage: nothing in the record can ever be
quietly changed, which matters most in exactly the artefact `CLAUDE.md` holds to the highest
standard because it is the part Clement authored himself.

It loses on what an ADR is _for_. A superseding note is right when a reader needs to know that the
decision used to be different — that is information about the thinking. A note saying "this
sentence never described the code" is information about a typo, and it costs every future reader
the work of reconciling two paragraphs to discover that one of them was always wrong.

**Rewriting freely, including decisions.** Rejected for the reason the original rule gives: a
decision that can be edited after the fact is not a record, and the option that was rejected is
half of what an ADR is worth.

## Reconsideration threshold

Reopen if a correction is ever made that a reader would have needed to know about as _history_ —
the first time "this was never true" turns out to mean "we thought it was true and acted on it for
a phase". That is a changed decision wearing a correction's clothes, and it is the signal that the
test in the Decision section is being applied too loosely.

Reopen if `docs/adr/` ever leaves this repository for a context where git history does not travel
with it. The correction is visible in git; that is load-bearing here, and it stops being true the
day the directory is published as flat files.

## Consequences

Three ADRs are corrected in the commit that accepts this one, and `docs/BUILD-RULES.md` § Working
discipline states the two-branch rule instead of the absolute one.

`docs/PHASE-4-5-CLOSURE.md` said "ADRs are never rewritten" in three places while proposing
superseding notes for exactly these corrections. Those rows resolve as in-place corrections
instead, which is a smaller change than the file assumed.

The cost is a judgement call at the moment of writing — "did the decision move?" — where there used
to be a rule that needed none. The mitigation is that the question has an objective answer: if the
code changed, the decision moved; if only the sentence changed, it did not.
