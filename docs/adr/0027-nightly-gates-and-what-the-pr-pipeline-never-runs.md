# ADR-0027 — Nightly gates, and what the PR pipeline never runs

- **Date**: 2026-08-28
- **Status**: accepted

## Context

`docs/BUILD-PLAN.md` § Phase 7 reserved this number for one decision — mutation testing on
`domain/`, nightly, and why the PR pipeline stays short. Closing it surfaced two more, both filed
in `docs/open-questions.md` on 19/08/2026 and both pointed at this ADR by name, because both ask
the same underlying question this one does: **what belongs in which suite, and at what speed does
it have to prove itself?** All three are decided here together rather than split across three
documents that would each answer a third of one question.

1. **What runs on every push, and what runs once a day.** The PR pipeline (`ci.yml`) already
   carries ten jobs: boundary, lint/format/types, unit tests with a 90 %/85 % coverage gate, an
   end-to-end Playwright suite against the served build, integration tests against a real
   Postgres, two migration-replay checks, three security scans.
   Coverage says **how much** of the domain a test touches. It cannot say **whether** the
   assertion that touched a line would actually catch a wrong answer — an agent-produced test
   that calls a function and asserts nothing passes coverage and proves nothing. Mutation testing
   is the direct answer to that question, and it is slow: instrumenting `domain/` and running the
   suite once per surviving mutant is minutes, not seconds, on a codebase this size, and grows
   with the domain rather than staying fixed.

2. **ADR-0003 rejected Postgres RLS on testability, and the row of 19/08/2026 asks whether that
   argument was ever cashed in.** ADR-0003's rejected-option section reads: "every authorization
   test then needs a live Postgres … At the repository, the same proof runs in milliseconds
   without a database." Every `CraRepository`/`InvoiceRepository` authorization test written
   since Phase 3 is a `.int.test.ts`, against a real Postgres. Read narrowly, the sentence looks
   unpaid.

3. **ADR-0019's own reconsideration threshold — "~12 integration tests per module, or the first
   test whose setup exceeds its assertion in complexity" — is crossed**, and the row of
   19/08/2026 asks whether a shared fixture or a test-database-per-suite model should replace
   per-test transaction rollback. Recounted today rather than trusting the 19/08 figures (the
   row's own instruction): `packages/billing/src/infrastructure/*.int.test.ts` now holds **37**
   tests (30 on `pg-invoice-repository`, 7 on `pg-numbering-counter`); `packages/timesheet` holds
   **17**. Both are well past the original heuristic, and Phase 5 added a second population
   entirely outside it — 12 more `.int.test.ts` files under `apps/api/src/{routes,web,chain,
persistence,personas}` and `tests/`, route- and composition-level integration tests the
   original count never anticipated.

## Decision

**On the nightly/PR split (the reserved subject):** Stryker mutation testing runs in a new
`.github/workflows/nightly.yml`, scheduled once a day (`workflow_dispatch` also enabled, since a
`schedule:` trigger does not fire until this workflow is on the default branch — see
Consequences). Scope is `packages/*/src/domain/**/*.ts` only, via `stryker.config.json`, and
nothing else joins it: no end-to-end suite, no volumetry mode. Both are absent from this
repository entirely (README, "Ce que je ne construis pas") and neither is a mutation-testing
question — naming them here would imply a nightly tier exists to eventually hold them, and it
does not. The PR pipeline is unchanged: ten jobs stays ten, because this ADR adds no job to it —
the tenth, `web-e2e`, has been running since the front-end plan's Phase 9.6 and is only _counted_
by this phase, in the README row task 7.3 owed it. A documentation fix, not a new job.

**On ADR-0003's testability claim (row 1 of 19/08/2026):** narrowed to what is actually true,
rather than built out to make the original sentence hold. `readScope`/`assertMayRead`
(`packages/platform/src/scope.ts`) **is** the authorization rule ADR-0003 means by "the same
proof", it lives in the kernel exactly as ADR-0033 requires, and it already has a millisecond,
no-database unit test (`packages/platform/src/scope.test.ts`) that predates this ADR. That part
of the claim was true and stays true. What every `.int.test.ts` on a repository actually proves is
a different thing: that the SQL a repository method issues fetches the columns `assertMayRead`
needs and calls it with them — `pg-cra-repository.ts` reads `office_id`/`consultant_id` off a row
and only then calls the kernel rule. That is not the authorization rule under test; it is the
wiring between real SQL and the rule, and wiring is not provable without the database whose column
names and types are the thing being checked. ADR-0003's sentence is corrected to say both halves:
**the rule is unit-tested; the repository's use of the rule is integration-tested, because that
half is a claim about SQL, not about the rule.**

**On ADR-0019's threshold (row 2 of 19/08/2026):** per-test transaction rollback with inline
fixtures **stays**, for every existing and future integration test, in every module. Rejected:
building an in-memory `CraRepository`/`InvoiceRepository` to run the authorization proof at unit
speed. Two reasons, not one — see Rejected option. Rejected also: a shared fixture module or a
test-database-per-suite model, for the reason under Rejected option below. The original numeric
trigger ("~12 tests per module") is retired as a decision input — it fired at both real counts
above and would have fired again at every later addition, which makes it a threshold nothing was
ever going to act on. It is **replaced** by two measured signals, checked at every phase
checkpoint from here on: **suite wall time** (`pnpm run test:int`, currently 188 tests, 4.27 s —
see Reconsideration threshold) and **whether a single unrelated schema change breaks tests in more
than one file**, which is what "setup exceeds its assertion in complexity" was actually trying to
detect and a raw count cannot.

## Rejected option

**Building an in-memory `CraRepository` (and `InvoiceRepository`) so the authorization proof runs
without Postgres**, closing ADR-0003's row by delivering the sentence rather than narrowing it.
`Clock` is the precedent BUILD-RULES names for exactly this shape of decision — a second
implementation that exists because a test needs it, not because production needs it — so the
option is not disqualified on architectural grounds. It loses on what it would actually buy here.
First, the thing worth proving fast is already proven fast: `scope.test.ts` unit-tests the rule
itself in milliseconds, today, with no database. Second, what an in-memory repository _would_ add
is a second implementation of "fetch a record, then decide whether this actor may see it" — and
the decide half is one line (`assertMayRead(actor, resource, record)`) that a fake can only call
correctly or incorrectly, never partially; the fetch half is the part that differs from
`pg-cra-repository.ts`, which is exactly the SQL wiring the rule cannot exercise on its own. A fake
that skips the SQL does not shorten a real integration test, it duplicates a smaller and less
faithful version of it — closer to ADR-0003's own "both, as defence in depth" option, "the worst
answer available here": a second implementation of a data-access path, hand-maintained in
parallel, whose only job is to make a sentence written in 2026-08-17 literally true. The domain
gained no new test it could not already write.

**A shared fixture module** (one seeded office/client/mission set every integration test reads,
instead of each test building its own with unique-prefixed ids) is the standard answer to "37 and
17 tests each rebuild inline" and was seriously considered. It loses to the second measured signal
above: this repository's whole authorization thesis rests on tests that prove a _specific_ actor
cannot see a _specific_ out-of-scope record, and that proof reads best when the test that makes
the claim also builds the two offices it is claiming about, next to the assertion, with no
indirection through a shared file a reader has to open to know what "office A" and "office B" are.
A shared fixture would shrink the diff of the next schema change at the cost of moving that
context out of the 37 tests that currently state it for themselves — the tests would get shorter
and less self-explaining at the same time, in a repository whose specific and repeated claim is
that a reader can verify each demonstration in place.

**A test-database-per-suite model** loses on the same evidence that keeps rollback: 188
integration tests run in 4.27 s wall time (`Duration 4.27s`, `pnpm run test:int`, measured
2026-08-28), parallelised across four workers. Per-test rollback is not the bottleneck a
database-per-suite model would relieve; there is no bottleneck yet.

## Reconsideration threshold

**Nightly scope.** Reopen the day this repository adds an end-to-end suite or a volumetry mode for
a reason unrelated to this ADR (neither is scheduled, and this ADR does not schedule one) — at
that point the nightly workflow, not `ci.yml`, is where the discussion about their runtime starts.
Reopen the mutation scope itself the day `packages/platform/src/**` needs the same proof
`domain/` gets: `vitest.config.ts`'s coverage gate already includes it (ADR-0033: no `domain/`
directory, same domain-grade status) and this ADR's `mutate` glob currently does not, which is a
real gap named here rather than silently carried — see the phase checkpoint.

**The ADR-0003 narrowing.** Reopen if a repository method's authorization check ever needs to be
proven at unit speed for its own sake — e.g. a hot path called from inside a loop where a real
integration test's per-call overhead becomes the actual bottleneck, not merely "would be nice to
run without Docker." The discriminator stays the one BUILD-RULES already states for ports: a new
test the second implementation makes possible, not a wish to shorten a sentence.

**The integration-suite shape.** Reopen — in favour of a shared fixture or a database-per-suite
model — at either of the two measured signals this ADR substitutes for the retired count: `pnpm
run test:int` exceeding roughly **30 seconds** in CI (about seven times today's measured runtime,
chosen because it is the point a database job stops being the fastest gate in the pipeline rather
than one of the fastest), or the first schema change whose migration breaks integration tests in
**more than one file** for a reason unrelated to what that file is actually testing (a genuine
cross-cutting setup cost, not a coincidence of two tests happening to use the same office name).

## Consequences

**Easy.** The PR pipeline stays at ten jobs and a few more minutes at most — task 7.3 corrects
the README's stale count of nine, which is `web-e2e` getting the README row it was always owed,
not a job this ADR adds. A slow, high-signal proof gets a home that does not threaten to be bypassed.
ADR-0003's claim is now fully defensible instead of half-true, and the repository's own discipline
of narrowing a claim rather than building around it to keep a sentence intact (ADR-0045, ADR-0050,
ADR-0073) extends to a testability argument instead of only to prose.

**Expensive, and named rather than hidden.** `nightly.yml`'s `schedule:` trigger **has not run on
a schedule as of this ADR**: GitHub does not fire a cron trigger for a workflow file that is not
yet on the repository's default branch, and this branch is not merged. `workflow_dispatch` makes
it runnable by hand, and the phase checkpoint below records this as a task that did not complete
its own proof rather than a green claim standing on an untriggered run. The real first mutation
score, measured locally against `stryker.config.json` on 2026-08-28, is **72.80 %** overall
(billing 67.75 %, timesheet 79.07 %) — well under the domain's 90 %/85 % line-and-branch coverage
gate, which is exactly the gap this ADR exists to make visible rather than to close by fiat. The
lowest-scoring files are the `errors.ts` pair in both modules (12.5 % and 17.14 %): almost every
surviving mutant there is a template-literal string tweak inside a typed error's message, which
`ADR-0016`'s own contract does not ask a test to pin — tests assert `instanceof` and
`problemType`, not prose, and a test written only to kill a string-literal mutant would be exactly
the brittle, proves-nothing test BUILD-RULES warns against. The threshold is set from this number,
not around it: `break: 70`, a few points under 72.80 so the gate catches a real regression rather
than which mutant a concurrent worker happens to schedule first; `low: 70` to match, since there
is no orange band worth a third number yet; `high: 85` as the same "good" bar the domain's own
coverage gate uses, a report color and not a claim this run already meets.
