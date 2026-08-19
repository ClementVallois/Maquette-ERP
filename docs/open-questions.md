# Open questions

What is **not** decided, with its impact and its date. An ADR records a decision; this file records
the absence of one. Absolute dates only. Nothing is deleted from here — a question that gets answered
moves down to "Settled" with its answer, so the record shows it was known rather than discovered.

## Open

| Since      | Question                                                                                                                                                                                                                                                                                                                                                                                                                   | Impact if wrong                                                                                                                                                                                                                                                                                                                                                                                                                    | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17/08/2026 | The VAT rates, thresholds and mandatory mentions in ADR-0010 are those known on 17/08/2026 and have **not** been validated by an accountant.                                                                                                                                                                                                                                                                               | An invoice that is legally contestable. Bounded here because the mockup issues nothing to a real client, but it must not be presented as authoritative.                                                                                                                                                                                                                                                                            | Named in the README as requiring validation before any production use. Not blocking the mockup.                                                                                                                                                                                                                                                                                                                                                                                                      |
| 17/08/2026 | The e-invoicing reform calendar (reception 01/09/2026, emission for PME 01/09/2027) has already slipped several times.                                                                                                                                                                                                                                                                                                     | An oral argument built on a date that moves.                                                                                                                                                                                                                                                                                                                                                                                       | Cited with the caveat attached. Recheck before 24/08.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 17/08/2026 | `scripts/boundaries.ts` cruises `apps/*/src/**/*.ts`. ADR-0015 declares the tier but no app exists yet, so the layout a real app will have is not fixed — an `apps/web/app/**` or `apps/api/lib/**` would not match that glob.                                                                                                                                                                                             | The boundary gate stays green on an application it never looked at. This is the exact failure the `totalCruised > 0` assertion exists to rule out, reintroduced one directory level down.                                                                                                                                                                                                                                          | The global `totalCruised > 0` check does not catch it: `packages/` alone keeps the count non-zero. Resolve **in Phase 5**, when the app's directory shape is decided, by asserting per workspace member rather than globally. Building the assertion now would guess the shape it is meant to verify.                                                                                                                                                                                                |
| 17/08/2026 | **The private archive of the purged triage has no remote.** `CHOIX.md` and `draft.md` now exist only in a local `Maquette-ERP-notes` git repository on one machine — the public history no longer holds them, by design.                                                                                                                                                                                                   | Disk loss destroys the reasoning behind 478 arbitrations, and with it the only thing able to justify the two figures the README advertises. ADR-0014 names this exact shape as the option it rejected: "the same decision with the backup left to chance".                                                                                                                                                                         | The purge ran before the archive was pushed, which inverts the intended order — accepted knowingly, with a full mirror of the pre-rewrite repository kept locally as well. Closing it needs a **private** GitHub repository named `Maquette-ERP-notes` and one `git push`; `gh` is installed but not authenticated. Owner: Clement. Before the repository goes public.                                                                                                                               |
| 18/08/2026 | **`docs/BUILD-PLAN.md` names "the 24/08 conversation" with no antecedent**, and `docs/open-questions.md` names an owner by first name and records a machine's `gh` auth state as a project blocker. A cold reader on `feat/billing-domain` hit both and could recover neither from anything in the repository.                                                                                                             | The plan's Calendar section — the part that says what ships and what the fallback is — rests on a date whose meaning is nowhere written, so the reasoning behind the fallback reads as arbitrary.                                                                                                                                                                                                                                  | Not a defect to fix silently: saying what 24/08 is means disclosing, in a public repository, why this mockup exists and who it is for. That is a **disclosure decision, and it is Clement's**, not one to make on his behalf while writing the code. Two shapes are available — name it plainly, or replace every "24/08" with "the date the repository link goes out" and drop the definite article. Decide **in Phase 9** (task 9.2, the cold reader's path), before the repository link goes out. |
| 19/08/2026 | **Child-row ids are positional strings, not UUIDv7 generated in the application.** `pg-invoice-repository.ts` and `pg-cra-repository.ts` mint line, flag and VAT-group primary keys as `` `${parent.id}-line-${index}` ``. `docs/BUILD-RULES.md`: "Ids are UUIDv7 generated in the application, so an aggregate can be built without touching the database."                                                               | The id is positional, so reordering an invoice's lines rewrites the identity of every line of a legally immutable document. Bounded today: `#replaceLines` deletes and re-inserts on every save, so nothing outside the aggregate holds those ids, and no foreign key points at them. It stops being bounded the moment anything references a line — a credit note on one line, an export, a URL.                                  | Resolve **in Phase 4**, with the seed: that task introduces the deterministic id generation the whole dataset needs, and doing it once for parents and children is cheaper than twice. Until then no code may reference a child id across a save.                                                                                                                                                                                                                                                    |
| 19/08/2026 | **`billing.credit_notes` and `billing.declined_days` are created by migration 003 and used by nothing.** No code writes them, no code reads them, no test touches them. YAGNI is claimed out loud in `docs/BUILD-RULES.md` § "Claimed out loud".                                                                                                                                                                           | Two unused tables are the counter-example a reviewer picks up first, in the repository that names YAGNI as its sorting criterion. Also, ADR-0018's single shared series is enforced by two independent `UNIQUE` constraints (`invoices.invoice_number`, `credit_notes.document_number`), so the schema permits an invoice and a credit note to carry the same number — the counter prevents it, and nothing doubles or tests that. | Not decided here, and deliberately not "drop them": `CreditNote` is domain code that exists and is tested (ADR-0036), and its repository is the natural other half. Resolve **in Phase 5**, which builds the issuance path — either the credit-note repository lands and the tables get their reader, or the tables go and come back with it.                                                                                                                                                        |
| 19/08/2026 | **`pg.types.setTypeParser(1082, …)` is a process-global mutation run as an import side effect, from two modules that must not know about each other.** Duplicated in `pg-cra-repository.ts` and `pg-invoice-repository.ts`, with the footgun explained in one copy only.                                                                                                                                                   | Whichever module is imported first silently decides `DATE` parsing for the other. Harmless while both set the same parser; a divergence would be invisible and would surface as a date that is off by a timezone in one module only.                                                                                                                                                                                               | Resolve **in Phase 5**: a process-global belongs to the composition root, which is `apps/api` and does not exist yet. Moving it there is the fix; doing it now would mean guessing where the root lives.                                                                                                                                                                                                                                                                                             |
| 19/08/2026 | **The per-schema grants of migration 001 are load-bearing in no CI job.** `ci.yml` re-grants everything explicitly after migrating, so a broken `DO $$` block is masked; and `migrations-replayed-twice` never creates `erp_app`, so the block's `IF EXISTS (SELECT 1 FROM pg_roles …)` is false and it skips. BUILD-PLAN 3.2 named those grants as a mechanical fact the task had to absorb.                              | The grants are what let the least-privilege application role read anything at all. Locally they work — `pnpm run db:up && pnpm run migrate && pnpm run test:int` was replayed from a destroyed volume on 19/08/2026 and passes — so the code is right; it is the _gate_ that would not notice it breaking.                                                                                                                         | Resolve **in Phase 7, task 7.2** (CI hardening): drop the explicit re-grant from `ci.yml` so the migration's own block is what the integration job depends on. Not done here because removing it while the job is the only proof the suite runs at all trades a tested gate for an untested one mid-phase.                                                                                                                                                                                           |
| 19/08/2026 | **Authorization is by `Office` scope only — the role dimension of task 3.3 was not built.** `docs/BUILD-PLAN.md` § 3.3 says "three roles × `Office` scope, one rule, one source"; `CLAUDE.md` claim 3 and the README say "by role **and** by scope". Both repositories take `actor: { officeId }`, and there is no role type, no role parameter and no role check in `packages/*/src`.                                     | Half a claim advertised as a whole one — the failure mode this repository is built to refuse, on the claim a reader is most likely to check. Bounded: the scope half is real, tested in both directions (legitimate access passes, out-of-scope is refused), and `Cjm`/`Tjm`/margin are absent from every list projection.                                                                                                         | Resolve **in Phase 5**, with **ADR-0023** — the persona selector is the task that first produces an actor carrying a role, and building a role model before anything can assume one would be guessing its shape. The README no longer claims the role half in the present tense.                                                                                                                                                                                                                     |
| 19/08/2026 | **ADR-0003 rejected Postgres RLS on testability, and every authorization test written since needs a live Postgres.** The ADR's argument against RLS is that "every authorization test then needs a live Postgres … At the repository, the same proof runs in milliseconds without a database". All of Phase 3's scope tests are `.int.test.ts`.                                                                            | The decision is not wrong — the port carries the scope, so an in-memory proof is available — but the cost the ADR used to reject the alternative was incurred anyway, and an ADR whose stated advantage is not taken reads as reasoning fitted to a conclusion.                                                                                                                                                                    | Resolve **in Phase 7, task 7.1** with **ADR-0027**, alongside the integration-suite question above: both are the same question — what belongs in which suite. Either an in-memory `CraRepository` carries the scope proof at unit speed, or ADR-0027 states that the proof is worth a database and ADR-0003's argument is narrowed to what actually held.                                                                                                                                            |
| 19/08/2026 | **ADR-0019's reconsideration threshold is reached in the phase that wrote it.** It names "~12 integration tests per module, or the first test whose setup exceeds its assertion in complexity", at which point "a shared fixture or a test-database-per-suite model is cheaper than per-test rollback". `billing` ends Phase 3 with **22** (15 on the invoice repository, 7 on the numbering counter); `timesheet` has 10. | A threshold that is crossed and not looked at is a threshold that was decorative. The cost is not correctness — the suite is green and fast (39 tests, ~1 s) — it is that every one of those 22 tests rebuilds its own offices, clients and missions inline, so a schema change edits 22 setups.                                                                                                                                   | Not decided in Phase 3: the threshold asks whether a shared fixture is cheaper than per-test rollback, and that depends on what Phase 5's route tests need, which do not exist yet. Resolve **in Phase 7, task 7.1**, with **ADR-0027** — the task that decides what the PR pipeline runs and what it never does, which is where the shape of the integration suite belongs.                                                                                                                         |
| 18/08/2026 | **`PgEventStore` in `tests/harness/` uses UUIDv4 (`crypto.randomUUID()`) for event IDs, not UUIDv7.** The plan says "UUIDv7 generated in the application". For the event table's surrogate id, ordering is not critical (events are queried by `correlation_id`, not sorted by `id`), but the rest of the system will use v7.                                                                                              | Inconsistency. An event id that predates the event that caused it is confusing in a debug trace, not dangerous.                                                                                                                                                                                                                                                                                                                    | Resolve **in Phase 5** when promoting `PgEventStore` to `apps/api/`. Use the same v7 generator the rest of the application uses.                                                                                                                                                                                                                                                                                                                                                                     |

## Settled

| Settled    | Question                                                                                                                                                                                                                                                                                                                               | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 19/08/2026 | **Integration test files cause TS6059 in per-package typechecks**, recorded on 18/08 as "a latent error, not a CI failure" because "no CI job runs per-package typechecks", and deferred to Phase 5.                                                                                                                                   | **Fixed 19/08/2026 — ADR-0039**, and the deferral's premise was false when it was written. `pnpm run typecheck` is `tsc -p tsconfig.json --noEmit && pnpm --recursive --parallel run typecheck`: the recursive half _is_ the per-package typecheck, and Phase 3's own `quality` CI job runs it. The gate was red on the branch that recorded the row, not latent in it. `tests/harness` becomes the workspace member `@erp/test-harness`, a `devDependency` of both modules, imported through its `index.ts`; `rootDir` holds and the `../../../../tests/` climb is gone. **The deferral also hid a second defect**: `pg-invoice-repository.ts` used `ClientId` without importing it, reported by the same `tsc` run — a check nobody could get to green is a check nobody reads.                                                                                                                      |
| 18/08/2026 | **The CI `test` job failed from the moment coverage thresholds were added**: `test:cov` measured `packages/*/src/domain/**` against 90 % and that surface was two constant files, so it reported 0 % and exited 1. Recorded as known-red, deliberately not fixed by lowering the threshold or by writing a test that asserts nothing.  | **Green since Phase 1, 18/08/2026.** The timesheet domain and its 113 tests landed behind the threshold and the gate measures something: 99,3 % of statements, 100 % of branches and functions. Coverage now also includes `packages/platform/src/**`, which holds domain-grade code with no `domain/` directory (ADR-0033). The two files still at 0 % are the status enums, imported as types only until Phase 3 reads them from SQL. `Tests` is added to the required gates in the README; **the human step of ticking it in GitHub branch protection is outstanding**, as in task 0.5.                                                                                                                                                                                                                                                                                                             |
| 17/08/2026 | The working triage document (210 KB of unsorted internal French material) is tracked on pushed branches, and the repository goes public. `git rm` removes a file from the tree, not from history.                                                                                                                                      | **Purged, 17/08/2026.** ADR-0014 chose "rewrite **and** archive privately", and it was executed the same day: `git filter-repo --path CHOIX.md --invert-paths` across all **four** published branches — the plan said three, `chore/repo-hygiene` had been pushed too — then a force-push. Verified against a **fresh clone of the remote**: `git log --all -p -- CHOIX.md` is empty and no object is named CHOIX. Seven commits went with it: five pruned as empty by the rewrite, two already unreachable once the refs holding them were deleted. Three local refs carried the file, not the one the plan named — both Claude checkpoint refs and a `stash@{0}` predating the branch. `filter-repo` also remapped the one SHA cited in a commit body, so nothing dangles. The document now lives only in the local `Maquette-ERP-notes` archive, which **still has no remote** — see the row below. |
| 17/08/2026 | Phase 0's two blocked tasks: the purge (0.1) and the branch consolidation (0.5).                                                                                                                                                                                                                                                       | **Both ran, 17/08/2026.** `git-filter-repo` and `gh` were installed to `~/.local/bin` without root. 0.5: `develop` and `feature/ci-pipeline` merged to `main` and `develop` deleted, the CI `pull_request` trigger narrowed to `main` alone, and the five required checks documented in the README with `Tests` deliberately excluded while it is red.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 17/08/2026 | The README advertised "478 arbitrages, dont **246** écartés ou renvoyés à l'ERP cible", and `scripts/extract-triage.ts` — which lives in the private `Maquette-ERP-notes` archive with the document it measures, not in this repository — counts 478 total — matching — but **242**. Where do the four go?                             | **The README figure was one commit stale.** Counted at every revision of the triage: it was 246 until the commit that re-ranked the build order by dependency, which re-decided four rows from "écarté/renvoyé" to "à construire" — mutation testing on `domain/`, Renovate, progressive disclosure of `Tjm` and margin, and the dated manager attachment. Its message names all four; the README figure was not updated with them. Corrected to **242**. The eleven rows retained in reduced form with the remainder deferred were a plausible cause and are **not** the cause: splitting those gives 253.                                                                                                                                                                                                                                                                                            |
| 17/08/2026 | Monetary representation: integer cents (README) or `numeric(14,4)` plus a `Money` object?                                                                                                                                                                                                                                              | Integer cents, no wrapper type — **ADR-0002**, with three reconsideration thresholds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 17/08/2026 | VAT granularity: per line (README and `CLAUDE.md`) or per rate (the fiscal rule)?                                                                                                                                                                                                                                                      | Per rate — **ADR-0010**. The advertised invariant was reworded rather than worked around.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 17/08/2026 | Application shape: API only, fullstack framework, or classic server rendering?                                                                                                                                                                                                                                                         | Server-rendered HTML, no client framework, no front build step — **ADR-0009**. A fullstack framework blurs the server/client boundary this repository claims to hold.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 17/08/2026 | Server framework: NestJS or Fastify?                                                                                                                                                                                                                                                                                                   | Fastify — **ADR-0008**. NestJS modules give an _apparent_ boundary while the thesis is that it is verified by CI, and its DI would pull the framework toward the domain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 17/08/2026 | Data access: ORM, query builder, or raw SQL?                                                                                                                                                                                                                                                                                           | `pg` with hand-written SQL and numbered `.sql` migrations — **ADR-0011**. `FOR UPDATE`, per-module schemas and Postgres types must be expressible without an escape hatch.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 17/08/2026 | Authorization: repository or Postgres RLS?                                                                                                                                                                                                                                                                                             | Repository — **ADR-0003**. Never both, and never maintained twice by hand.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 17/08/2026 | `CONTEXT.md` at the root, or one per module?                                                                                                                                                                                                                                                                                           | Root only. Two modules do not justify two files.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 17/08/2026 | Branch model: `main` + `develop` + working branches, or `main` + short branches?                                                                                                                                                                                                                                                       | `main` + short branches. `develop` is merged and deleted before 24/08, and the CI triggers narrow with it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 17/08/2026 | i18n: externalise strings from the start, or a single language?                                                                                                                                                                                                                                                                        | Single language on screen (French), as a **written** choice rather than an omission. Labels stay centralised so they remain reviewable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 17/08/2026 | Do we claim the labels — DDD, Clean Architecture, SOLID, TDD, YAGNI?                                                                                                                                                                                                                                                                   | YAGNI yes, as the sorting criterion. SOLID no. DDD and Clean Architecture: the mechanisms are described, the words are not worn. A pattern name used must be defensible down to the line that implements it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 18/08/2026 | An `Intercontrat` consultant cannot submit a complete Cra: the submission checks require every workable day to be accounted for, and `DayType` has no value for "staffed on nothing".                                                                                                                                                  | **An internal non-billable mission, 18/08/2026.** Of the three candidates, the internal mission — a `Forfait` mission the intercontrat consultant is assigned to, so every workable day is recorded as `worked` against it — wins on two counts. First, the `DayType` enum is unchanged: a `worked` day on a `Forfait` mission is declined by `billing` as `notRegie` (ADR-0037), which is exactly the right outcome — the day was worked, it is accounted for, and it generates no invoice. Second, the completeness rule stays absolute: every workable day must be filled, for every consultant, with no exception. The rejected fifth `DayType` would have placed a firmwide structural term in the domain to accommodate one staffing scenario, and relaxing completeness would have weakened the rule that catches an unaccounted month. The seed in Phase 4 creates the mission.                |
| 18/08/2026 | **The history does not show red-green-refactor, and the build plan said it did.** Every task commit of Phase 1 carries the implementation and its test together, so the order they were written in is unverifiable from git. Two guards were also written _after_ a coverage report named them, which is honest and is not test-first. | **Decided 18/08/2026, at the start of Phase 2**, before its first commit set the precedent again. The claim is narrowed to what is verifiable — **the test is written first, the commit carries both** — and Phase 1's preamble in `docs/BUILD-PLAN.md` now says that instead, with a new "What the history shows about test-first" section stating the reasoning. The two rejected exits are named there: committing a red test contradicts the `pre-push` hook and would leave a red CI run on every branch push, and abandoning the discipline was never on the table. The cost is stated rather than buried — "test written first" is a statement about the author's discipline, not a property this repository proves. Phase 2 inherits the narrowed claim.                                                                                                                                       |

## Phase checkpoints

A phase ends with the two questions of `CLAUDE.md` — where am I least confident, and what breaks in
three months if this is left as it is — and every point raised resolves to exactly one of four
outcomes. What follows is the record; the rows above are the points that resolved to "a row in
`docs/open-questions.md`". Phase 0's checkpoint predates this section and lives in its rows and in
the commit `docs(docs): record the Phase 0 checkpoint`.

### Phase 1 — `feat/timesheet-domain`, 18/08/2026

**Every task of the phase ran**: 1.1 value objects, 1.2 `DayType` and `WorkingCalendar`, 1.3 the
`Cra` aggregate, 1.4 the reference projections, 1.5 the submission checks, 1.6 validation and the
event, 1.7 typed errors, 1.8 the dated hierarchy. Two departures from the plan, both deliberate:

- **1.7 ran first.** Every factory from 1.1 onwards refuses an invalid state by throwing, and the
  ESLint rule forbidding `new Error()` pointed at nothing. Writing the value objects first would
  have meant inventing an error type and back-filling ADR-0016 afterwards — the retrofit the ADR
  discipline exists to prevent.
- **Most of 1.1 landed in `@erp/platform`, not in `timesheet`.** `billing` may import nothing from
  `timesheet`, so a unit defined there is a unit Phase 2 has to redefine. ADR-0033 records the
  criterion and the rejected options.

19. **The two database CI jobs this phase added had never run a migration.** `pnpm run migrate` is
    `node --env-file=.env …`, and `--env-file` is a _hard error_ when the file is absent. `.env` is
    gitignored, so on the runner both `Integration tests` and `Migrations replayed twice` died at
    `node: .env: not found` — exit 9, before reaching the connection string the workflow hands them
    as a real environment variable. The jobs BUILD-PLAN 3.1 required "in the same PR that adds the
    harness" were therefore red from their first run, and the phase's claim that integration tests
    run in CI rested on a job that had never got as far as connecting. → **Fixed now**:
    `--env-file-if-exists`, so a real environment variable is enough and `.env` stays a local
    convenience. Reproduced locally by moving `.env` aside before it was fixed.

20. **The secret-scan job could not run on a pull request at all.** `gitleaks-action` asks the API
    for the PR's commits on a `pull_request` event, which `permissions: contents: read` does not
    grant; it exited on a 403. The push path scans the history directly and never needed it, so
    this surfaced only when the repository's **first** pull request was opened. → **Fixed now**:
    `pull-requests: read` on that job, and nothing wider.

Both of 19 and 20 are the same shape as points 8 and 15, one layer out: **a gate nobody had watched
run in the mode it will actually be judged in**. Phase 3 wrote its CI and never opened a PR with
it. The lesson is recorded here rather than as an ADR because it is not a decision — it is that
"the workflow is written" and "the workflow has passed" are different claims.

**Deferred, named rather than dropped:**

- **`CraRepository` is not built.** The plan's TDD table has an `application/` layer against
  in-memory port fakes; the validation use case is built, but a repository port with zero
  implementations proves nothing in a phase with no database. It lands in **Phase 3**, with the
  transaction that makes validation and the draft invoice commit together.
- **Rule 2 of separation of duties is not enforced** — whoever validates does not issue the
  invoice. It cannot be, here: `billing` is a status enum. ADR-0006 records the decision and the
  contract that makes it enforceable in **Phase 2** (`validatedBy` travels in the event payload).
- **The event contract has no consumer yet**, so the payload shape is verified by its producer
  alone. **Phase 2** is the first real reader, and it is the phase that would find a field missing.

**Raised and fixed inside the phase**, so they leave no row: the `domain-has-no-external-dependency`
rule could not see any npm import (the cruise excluded `node_modules` wholesale, so only a `node:`
builtin could trip it) — narrowed, exempted for test files, and given the negative fixture its
siblings have; the ESLint ban on `new Date()` covered colocated domain tests where a fake clock is
built from a literal instant — narrowed to the wall clock for test files; `isBillable` existed while
the rule it holds was written a second time inline; and `daysInMonth` and `dayOfWeek` answered
nonsense for a month that does not exist.

**Two ADR numbers were taken outside the plan's reservation table** — 0033 and 0034 — for two
structural questions the plan had not identified. `docs/adr/README.md` says why they keep late
numbers.

**The line drawn in `CONTEXT.md`**: the vocabulary file gains the terms of the business —
`Period`, `HalfDays`, `Refused`, `Assignment`, `CraFlag`, `ManagerAttachment` — and the `CraLine`
and `Mission` entries were rewritten to say what the code now holds. Structural plumbing stays out:
`Timeline` and `Effective` (a mechanism, ADR-0034), `TimesheetReference` (a snapshot shape) and
`Hierarchy` (the lookup over `ManagerAttachment`, described in that entry). The test is whether a
consultant of the firm would recognise the word as one of theirs.

**The two reviewers ran before the merge**, as `CLAUDE.md` requires. The `cold-reader` pass found
five stalls a reader with no brief hits before reaching anything true. Four were defects or false
statements and were fixed on this branch: the ADR index had lost five decisions that exist on disk
and are cited by `CONTEXT.md`; the README claimed six required gates while its own note said the
sixth is not ticked; the thesis sentence named modules (`facturation`, `temps`) that no directory
carries; and nothing anywhere said how far the build had got, so `packages/billing` with one enum
in it reads the same as an abandoned repository. What is **not** fixed here belongs to **Phase 9**,
which owns it by name: the empty README sections — Architecture, Stack, Démarrer, Jeu de données —
(9.1), the five-line reader's path (9.2), the demo script (9.3), and the row-by-row review of this
file (9.4). Left half-done now, they would be rewritten there.

The `rules-auditor` pass found one violation, one missing negative test and one stale document,
all three fixed on this branch. The violation is the phase's most instructive mistake and is worth
reading twice: **ADR-0033 moved domain-grade code into `@erp/platform`, the coverage glob followed
it, and the two guards that constrain the domain did not.** For the length of the phase, a kernel
file could import an ORM, read the system clock and expose a public setter with a green CI, while
the same four lines in `timesheet/domain/` failed — the guard held the code that stayed and exempted
the code that moved. Both guards now name the kernel, and both have fixtures asserting they reject.
The second finding is the same family: the narrowed clock rule for test files shipped with no
negative test, exactly the state the no-external-dependency rule had been in for a phase. It now has
one, in the new `tests/lint-rules.test.ts`, which also proves the narrowing itself — a fixed instant
is allowed in a test, the wall clock is not, and building any `Date` in shipped domain code is
refused. `BUILD-RULES.md`, which declares itself "the checkable form of decisions already made", was
describing the older, narrower guards and now describes the ones that exist.

**Considered and left alone**: branding `IsoDate` and `Tjm` as nominal types. It would catch a
`Period` string passed where a day is expected, and ADR-0002 already records the same mitigation
as deliberately not taken for cents. Taking it here and not there would be an inconsistency
decided by whoever wrote the file last.

### Phase 2 — `feat/billing-domain`, 18/08/2026

**Every task of the phase ran**: 2.1 line arithmetic, 2.2 the origin on the line, 2.3 VAT
resolution and the dated rate table, 2.4 the invoice document, 2.5 numbering and the state machine,
2.6 the coherence check and `CreditNote`, 2.7 the minimal `Client`. Three departures from the
plan's order, all deliberate:

- **The lint rule ran before the arithmetic it guards.** `BUILD-RULES.md` § Money has claimed, in
  the present tense since Phase 0, a rule forbidding float-producing arithmetic on money. It did
  not exist. Writing the rounding helper first would have meant reaching for `Math.round` and then
  retrofitting the helper around a rule written afterwards — the same reason 1.7 ran first in
  Phase 1. ADR-0035 records what it bans and what replaces each ban.
- **2.7 ran early**, and 2.3 ran before 2.2. The client and the commercial projection are what
  every later task reads, and a line freezes a VAT treatment onto itself, so the treatment has to
  exist before the line does.
- **The invoice's arithmetic moved out of the aggregate in 2.6**, into `document.ts`, once
  `CreditNote` needed the same recapitulative. A credit note that summed differently from the
  invoice it reverses is the discrepancy the module exists to prevent, so this is the DRY face
  `BUILD-PLAN.md` calls required rather than the one it calls forbidden.

**Three debts Phase 1's checkpoint assigned to Phase 2, and what happened to them:**

- **Rule 2 of separation of duties is now enforced.** `Invoice.issue()` refuses whoever validated
  the days it bills, with a negative test. `billing` holds a rule about an act performed in
  `timesheet` without importing it, which is what `validatedBy` in the payload was for (ADR-0006).
- **The event contract has its first real reader, and the payload is sufficient.** The verdict
  Phase 1 asked for: nothing was missing. `period` gives both dated resolutions their date,
  `craId` gives every line its audit trail, `validatedBy` gives rule 2 its subject, and the
  per-mission breakdown is what lets one Cra produce several lines. The one thing the payload does
  **not** carry — the billing model — is correct: it is a commercial term, `billing`'s to know
  (ADR-0031), and a payload carrying it would make `timesheet` responsible for it.
- **The boundary held under a real consumer.** No file of `packages/billing`, tests included,
  imports `timesheet`; the test builds the event from the contract in `@erp/platform` and mocks
  nothing, because the dependency rule would have refused the alternative.

**Raised and fixed inside the phase**, so they leave no row: the first per-rate rounding test was
written on two lines of 1 010 cents, which answers 172 whether VAT is rounded per line or per rate —
it proved nothing, and was replaced by two lines of 1 005, where the two orders give 170 and 171.
The replacement was checked by rounding per line on purpose and watching it fail. `billing`'s
`tsconfig.json` excluded `src/__boundary-fixture__` only, so the new fixture one directory down
would have been compiled; it now matches `timesheet`'s `src/**/` form. `vitest` was missing from
`billing`'s manifest, which `import-x` judges each test against.

**Five ADR numbers were taken.** Three were reserved by the plan and are consumed here — **0013**
(the line carries its origin), **0017** (legal mentions modelled, not templated), **0018** (one
series for invoices and credit notes). Two are new and continue the 0033/0034 sequence: **0035**
(exact money arithmetic, half-up on integers and rates in basis points) and **0036** (a credit note
carries positive amounts), both forced by writing `roundHalfUp` — whether a rate can be a decimal
fraction, and whether an amount can be negative. **0037** was forced by the first real consumption
of the event: what happens to days that are not billable here.

**Two decisions inside ADR-0017 that could have been side effects and are not**: "45 jours fin de
mois" is computed by adding the days and then moving to the end of that month, with the other
accepted reading named; and the `Tjm` and the VAT rate **both** resolve at the close of the period
the work covers. The alternative — the VAT at the invoice date, which the debits option would
suggest — splits the document across two resolution dates for a distinction (_fait générateur_
versus _exigibilité_) this build cannot settle. The residual doubt belongs to the row above
recording that none of these fiscal rules has been validated by an accountant, and that row now
covers ADR-0017 as well as ADR-0010.

**Deferred, named rather than dropped:**

- **The gapless allocation of a number is not built.** This phase holds the **shape** of the series
  and of the number (ADR-0018); the locked row that makes the sequence gapless under concurrency is
  **ADR-0007, Phase 3**. The split is the reason the shape could be tested without a database.
- **`assertDocumentAddsUp` is tautological today.** It compares totals against the lines they were
  just computed from. It is written for **Phase 3**, where the totals are columns and the lines are
  another table and the two can disagree; the four negative tests write the disagreement by hand
  because that is the only way to reach it now.
- **`InvoiceRepository` is not built**, for the reason `CraRepository` was not: a port with zero
  implementations proves nothing in a phase with no database. **Phase 3.**
- **`Forfait` is modelled and not billed**, by decision (ADR-0037) rather than by omission.

**Something Phase 3 inherits and must not read narrowly**: the reserved subject of ADR-0021 is
"validating twice does not produce two invoices". One validated Cra can span missions sold to
several clients, so it drafts **several** invoices. The idempotency ADR-0021 owes is over the
**set**, not over a single document.

**The line drawn in `CONTEXT.md`**: the vocabulary gains `Client`, `Territoriality`, `VatTreatment`,
`Autoliquidation`, `InvoiceLine`, `RegieDays`, `InvoiceStatus`, `Issued`, `CancelledByCreditNote`,
and the `CreditNote` and `InvoiceNumber` entries were rewritten to say what the code now holds.
`CancelledByCreditNote` went into the vocabulary file **before** `invoice-status.ts` dropped
`credited` — the enum follows the vocabulary, never the other way round. Structural plumbing stays
out, on the Phase 1 criterion: `SeriesKey`, `AccountableDocument`, `BillingReference`, `LegalEntity`
and `LegalMentions` are mechanisms, and a consultant of the firm would not call them theirs.

**The two reviewers ran before the merge**, as `CLAUDE.md` requires.

The `cold-reader` pass executed the README's quickstart verbatim and checked every claim it makes
against the files it never links to. **Three statements were ahead of the code, and two of the three
were this phase's own:**

- « sans qu'aucun fichier de `billing` — tests compris — n'importe `timesheet` » — written in this
  phase, and falsified by a five-second grep: `packages/billing/src/__boundary-fixture__/` imports
  `timesheet` on purpose, so that `tests/boundary-rule.test.ts` can prove the rule rejects it. The
  claim as meant — no **shipped** file — is true and stronger, and the README now says that and
  names the exception.
- « la numérotation des factures est **séquentielle et sans trou** » — this phase built the series
  and left the claim absolute. `numbering.ts` says in its own header that only the shape exists and
  that the gapless allocation is ADR-0007 in Phase 3; the ADR index lists 0007 as not yet decided;
  the README said neither. It now says both.
- « **L'autorisation est testée** … et c'est un test qui le prouve » — present indicative, no test,
  and none possible: authorization lives in the repository (ADR-0003) and there is no repository
  until Phase 3. It predates this phase and is corrected here rather than left for Phase 9, because
  a false claim on `main` is not an unwritten section. The « Ce qui n'existe pas encore »
  enumeration, which is where a reader looks, now lists it too.

Also fixed here because each was a **wrong or missing fact** rather than an unwritten section: the
README said "sur 10" where the plan says eleven phases numbered 0 to 10; it gave the Node and pnpm
preconditions a patch version below what `package.json` requires, with `engine-strict` on, so the
very first command hard-fails instead of warning; it described the lefthook hooks as active without
saying that `ignore-scripts` means a fresh clone has none until `pnpm exec lefthook install`, and
named the pre-push test job as the unit tests where `lefthook.yml` runs `test:cov`; it argued the
Odoo case on PASSI, auditor independence and SIEM export without ever stating that the firm does
cybersecurity — a premise only `CONTEXT.md` carried, two hops away and in English; and its headline
claim, that breaking the boundary fails CI, offered the reader no route to the rule or to the test
that proves it rejects.

**Routed to Phase 9, which owns them by name, rather than half-done here:** the FR→EN handoff is
unannounced and unhelped — a French reader told to look up « avoir » finds an entry headed
`CreditNote` — and `packages/contracts` is invisible to every reader-facing document while
`pnpm install` announces five workspace projects. Both belong to task 9.2's reader's path and to
9.1's Architecture section, and writing them now means rewriting them there.

**Confirmed rather than assumed**, and worth recording because it is the half that usually is not
checked: the quickstart runs as written, all four README links resolve, the six CI gates and their
commands match the table, the coverage threshold and its scope are what the README says, all eight
dependency rules carry `severity: 'error'`, and VAT is genuinely grouped by rate in `document.ts`.

The `rules-auditor` pass read the diff blind against `docs/BUILD-RULES.md` and found **eight
points**. Two were defects I would not have merged, and both share a shape worth naming: **dormant
today, live exactly when the next phase makes them matter.**

- **`issue()` allocated the number before it validated.** A refusal left the invoice holding an
  allocated number, series and date while still a draft, so a retry consumed a second number and
  the first was burned — a gap, in the series whose only property is having none (ADR-0018). The
  discipline was written and tested one file over, in `creditNote`, and not applied here. Today the
  only reachable refusal is a bad sequence; from Phase 3 the coherence check can refuse too, on
  totals read back from columns. Fixed, with the negative test that proves the retry takes the
  number it was given.
- **The money lint rule stopped at `domain/` while the money did not.** `packages/billing/src/
application/draft-invoices.ts` — the file that reads a `Tjm` off the reference and hands it to a
  line — matched no block carrying the rule, so `Math.round(tjmCents / 2)` linted clean there. This
  is the failure family `BUILD-RULES.md` § Boundary and layering names in its own words, one
  directory down, in the phase whose headline was closing that family. The three **calls** are now
  repository-wide, which is how BUILD-RULES states them; the decimal **literal** stays scoped where
  ADR-0035 put it, and a fixture in `application/` asserts both halves of that split.

Four more were real and are fixed here:

- **`**/testing/**` was borrowing the exemption granted to `*.test.ts`.** BUILD-RULES justifies that
  exemption on "it is not shipped" — and a `testing/` file is in its package's `tsconfig`, compiles
  to `dist`, and since this phase is where every seeded `tjmCents` in `billing` is written. It lost
  three guards it should have had, including the decimal-literal ban, on the one file authoring
  monetary values. It now keeps the domain list with the single narrowing a fixture builder needs.
- **The decimal-literal ban could not see a float without a dot.** `85e-3` is 0.085 — the exact
  value ADR-0035 § Context is written about — and the selector was anchored on the decimal point.
  The guard's own fixture wrote only `0.2`, so the hole was invisible to the test that exists to
  prove the guard fires.
- **A refusal named the wrong reason.** `paymentTerms({ days: -1 })` answered "capped at 60 days,
  and -1 was agreed". The commit `fix(platform): let a refusal name the value it refused` closed
  exactly this family on `main` the day before this module was written, and it came back. The test
  asserted only the class, so it locked the wrong reason in; it now asserts the message.
- **`commercialMission` commented a premise it did not hold.** "A Tjm is a whole number of euros,
  so it is even" — checking only evenness accepts 650,02 €, which contradicts `CONTEXT.md` § Tjm.
  It now checks the premise. The evenness assertion at the division stays, because BUILD-RULES
  names it there, and this is what guarantees it can never fire.

Two were about the record rather than the code, and are the more instructive pair:

- **The per-client split had no ADR.** Drafting returns a set, one invoice per client, and this
  changes the cardinality of the chain every document in the repository states in the singular. It
  was argued in a commit message, which is not where BUILD-RULES says a structural decision lives.
  **ADR-0038** records it, with the two serious alternatives and the threshold — and it is the
  right place for the consequence this checkpoint had already flagged for Phase 3, that ADR-0021's
  idempotency is owed over the set.
- **Six terms were in code and in neither `CONTEXT.md` nor this checkpoint's exclusion list** —
  neither admitted nor deliberately declined, which is the gap the vocabulary rule exists to close.
  `ServiceNature`, `BilledParty`, `PaymentTerms`, `EarlyPaymentDiscount`, `OperationCategory` and
  `DeclinedDays` are now in the vocabulary. The auditor was right that `DeclinedDays` was the one
  that mattered: ADR-0037 puts it on a manager's screen, which is the test.

One more, taken under the narrow correction `docs/adr/README.md` allows **before a branch merges**:
ADR-0035 stated half-up as `(numerator + denominator / 2) / denominator`, which divides by two and
would produce the float its own third rule forbids. The code never did that. The sentence was false
when it was written, the decision and the rejected option and the threshold are untouched, and the
commit says so.

**Cleared and worth recording, because an audit that lists only faults misreports the work**: the
one-division-at-one-call-site claim is literally true (`invoice-line.ts` routes both the unit price
and the amount through `lineAmountCents`); the per-rate rounding is proved on the discriminating
case; no dependency was added (the lockfile diff is one importer gaining `vitest`); all twelve
commit messages pass `commitlint` with no `Co-Authored-By` anywhere; and the French strings in
`NOT_CHARGED_MENTIONS` are the case the language rule exists for — text art. 294-1 and art. 283-2
du CGI legally require to be printed.

**Considered and left alone**: `serviceNature` is accepted by `resolveVat` and no branch reads it.
YAGNI would remove it; ADR-0010 names it as one of the four inputs, and `BUILD-RULES.md` says that
when a rule and an ADR disagree the ADR wins. It stays, and the reason it is not dead code is that
its absence is what makes a rate look like a property of the client.

### Phase 3 — `feat/persistence`, 18/08/2026

**Every task of the phase ran**: 3.1 ADR-0019 and the integration harness, 3.2 migrations and the
runner, 3.3 repositories with office-scoped authorization, 3.4 gapless numbering and the
transaction (ADR-0007), 3.5 domain events as the persisted audit journal (ADR-0020), 3.6 idempotent
CRA processing (ADR-0021). One departure from the plan's granularity, deliberate: tasks 3.1, 3.2
and the first half of 3.3 landed in a single commit because the migration runner, the test harness
and the first migration are co-dependent — a harness with no table proves nothing, and a migration
with no test runs blind.

**Eleven commits on `feat/persistence`**: five of build, this checkpoint, and five written after
it — two when the phase's own gate was finally run green (points 1 and 6), three answering the two
blind reviewers (points 8 to 18). They carry five ADRs (0019, 0007, 0020, 0021, 0039), six
migration files, and **307 tests (264 unit + 43 integration, all green, domain coverage 98,8 %)**,
plus the BUILD-PLAN correction for ADR-0038's cardinality change.

**The checkpoint below was written before the reviewers ran, and its first six points are what the
phase found in itself.** Points 8 to 18 are what it did not: two blind agents — a rules auditor
against `docs/BUILD-RULES.md` and a cold reader with no brief — found a correctness defect that
defeated the phase's headline invariant, three guards this phase had switched off by
configuration, four tests that could not fail, and a README describing the repository two phases
back. That ratio is the honest measure of what a self-checkpoint is worth, and it is left visible
rather than rewritten into a single tidy list.

**Raised and resolved to one of the four outcomes:**

1. **TS6059 — integration test files outside each package's `rootDir`.** Both `timesheet` and
   `billing` import from `tests/harness/`, which is outside their `rootDir`. The per-package `tsc`
   fails; the root typecheck and vitest both pass. → **First recorded as an open question** for
   Phase 5, on the ground that no CI job ran per-package typechecks. **That ground was false**:
   `pnpm run typecheck` ends in `pnpm --recursive --parallel run typecheck`, and this phase's own
   `quality` job runs it, so the gate was red on this branch. → **Fixed before the PR — ADR-0039**:
   `tests/harness` becomes the workspace member `@erp/test-harness`. The row moved to "Settled"
   with the correction stated rather than being quietly deleted.

2. **`PgEventStore` uses UUIDv4 not v7 for event IDs.** The plan says v7. For the audit journal's
   surrogate id, ordering is not critical (events are queried by `correlation_id`, not sorted by
   `id`), and the harness deliberately avoids importing from `@erp/platform` or adding a v7
   dependency. → **Open question**, resolve in **Phase 5** when promoting the event store to
   `apps/api/`.

3. **BUILD-PLAN 3.6 said `UNIQUE(cra_id)`, ADR-0038 changed the cardinality.** A plain
   `UNIQUE(cra_id)` would reject the normal ADR-0038 case (one CRA, two clients, two invoices). →
   **Fixed now**: the constraint is `UNIQUE(source_cra_ids[1], billed_to_client_id)`, BUILD-PLAN
   corrected, and ADR-0021 documents the composite key with the stale plan phrasing named.

4. **`hasCraBeenProcessed` is unscoped — no office restriction.** Every other read on
   `InvoiceRepository` is office-scoped (ADR-0003). This is a deliberate exception: it is an
   internal invariant check returning a boolean, exposes no data, and scoping it would let a
   replayed event draft duplicates in another office's transaction. → **No action**: ADR-0021 names
   the exception and its justification.

5. **The raw Postgres `23505` from the unique index crosses the repository boundary.** `saveDraft`
   now catches it by constraint name and rethrows as `CraAlreadyProcessedError` — a typed
   `BusinessError` with a `problemType`. Phase 5 maps it to `409 Conflict`. → **Fixed now**.

6. **`pg-invoice-repository.ts` used `ClientId` without importing it** — a plain compile error in
   shipped infrastructure code, on `main`'s doorstep. It was reported by the same `tsc` run as the
   TS6059 lines above, and went unread for exactly that reason: a check that cannot reach green is
   a check whose output nobody finishes. → **Fixed now** (the import is added), and the general
   lesson is recorded in ADR-0039's Context rather than left as an anecdote. The rule it produces:
   **a known-red gate is a defect with a deadline, not a state to build on.**

7. **ADR-0019's reconsideration threshold is at hand, and the phase did not say so.** It names
   "~12 integration tests per module"; `billing` finished the phase with more than that. → **A row
   in `docs/open-questions.md`**, to decide in **Phase 7, task 7.1** — where **ADR-0027** writes
   what the PR pipeline runs and what it never does, which is the decision the shape of the
   integration suite belongs to. Not decided here: the threshold asks whether a shared fixture is
   cheaper than per-test rollback, and the answer depends on what Phase 5's route tests need,
   which do not exist yet.

8. **The money guard was switched off in `infrastructure/`, the layer that reads money out of
   Postgres.** Phase 3 gave that layer its own ESLint block — `@types/pg` is a devDependency,
   `query<T>` is generic, a DB row needs a non-null assertion — and `no-restricted-syntax` does not
   merge, so writing the block dropped `NO_FLOAT_MONEY_CALLS` with the rest. `parseFloat`,
   `Number()` and `Math.round` were legal again, and `pg-invoice-repository.ts` used bare
   `Number()` on **ten** monetary columns. This is the `application/` finding of Phase 2, one
   directory further out, in the phase whose own README calls that failure family by name. →
   **Fixed now**: the calls are restored in the block (they always permitted `Number.parseInt`,
   which is what the block's comment claimed replaced them), the ten call sites go through a named
   `exactInteger` reader that refuses a decimal tail and a magnitude past `MAX_SAFE_INTEGER`
   instead of truncating, and a third fixture plus a negative test hold the rule — asserting
   **three** violations, not "at least three", so tightening the rule until the layer cannot work
   fails too.

9. **The role dimension of task 3.3 was not built, and nothing said so.** The plan says "three
   roles × `Office` scope"; `CLAUDE.md` and the README say "by role **and** by scope". What
   shipped is scope alone: both repositories take `actor: { officeId }`, there is no role type and
   no role check anywhere in `packages/*/src`. The scope half is real and tested in both
   directions. → **A row in `docs/open-questions.md`**, decided in **Phase 5** with **ADR-0023**
   (the persona selector), because that is the task that first produces an actor with a role to
   carry — and the README now says which half exists rather than claiming both.

10. **A repository refusal is `null`, not a typed 403 naming the rule.** ADR-0003 says the
    demonstration is two beats and the second is "a direct **API** call refused with a 403 that
    names the rule that denied it". Beat one exists (the out-of-scope record is absent). Beat two
    cannot exist yet: there is no API. → **No action, and not a deferral**: ADR-0003 already places
    that beat at the API, and Phase 5 owns it. Recorded here because a reader who checks the claim
    against the code before Phase 5 will otherwise find it missing with nothing to explain it.

11. **ADR-0003 rejected Postgres RLS on testability, and Phase 3 paid the cost anyway.** The ADR's
    argument is that at the repository "the same proof runs in milliseconds without a database".
    Every authorization test that exists is an `.int.test.ts` needing a live Postgres. The decision
    is not wrong — the port is what carries the scope, so an in-memory proof is possible — but the
    proof that was written is the one the ADR used to reject the alternative. → **A row in
    `docs/open-questions.md`**, decided in **Phase 7, task 7.1** with **ADR-0027**, alongside the
    integration-suite shape question of point 7: both ask what belongs in which suite.

12. **`CONTEXT.md` was untouched for the whole phase**, and Phases 1 and 2 each closed with a
    paragraph saying where the vocabulary line was drawn. Most of Phase 3 is plumbing that rightly
    declines an entry (`CraListItem`, `PgEventStore`). Two do not. → **Fixed now**: _piste d'audit
    fiable_ — a French legal term the ADRs use as load-bearing, and exactly the category
    `CLAUDE.md` says stays French — and `CraAlreadyProcessedError`, a business error bound for a
    user-visible 409, where `DeclinedDays` set the precedent.

13. **`source_cra_ids[1]` assumes single-element arrays.** The expression index guards only the
    first element. If the array ever holds more than one CRA id, duplicates in later positions slip
    through. → **No action**: this matches the current data model (one CRA per `saveDraft` call),
    and ADR-0021's reconsideration threshold names the condition under which the constraint must be
    extended.

14. **`save` erased `source_cra_ids`, defeating both idempotency layers at issuance.** `save`
    carries no source ids, so `EXCLUDED.source_cra_ids` is `'{}'`, and the `ON CONFLICT` clause
    assigned it. Issuing an invoice blanked the CRA link: `hasCraBeenProcessed` went false, the row
    left the partial unique index of migration 006, and the CRA end of the _piste d'audit fiable_
    was erased on the one document that is legally permanent. Replaying the event after issuance
    drafted a duplicate, silently. → **Fixed now**: the column leaves the `DO UPDATE SET` list —
    written by the INSERT, never updated. Three integration tests cover it, and all three fail on
    the previous code. Point 13 above analysed the `ON CONFLICT (id)` target of this same statement
    and did not see this; an analysis that finds nothing is not the same as a test.

15. **The domain's no-external-dependency rule was blind to an undeclared package.**
    dependency-cruiser classifies by the importing package's manifest; `pg` was declared only in
    the root one, so it resolved as `npm-no-pkg` — granted by the whitelist from the day the driver
    landed, never listed by the ban. A domain file could import the Postgres driver and cruise
    clean for the whole phase. **This is the second death of the rule the README already recounts
    dying once**, and the whitelist comment blamed pnpm symlinks, which was not the cause. →
    **Fixed now**: both modules declare `pg`, `npm-no-pkg` joins the ban, the comment says what
    actually classifies, and a fixture importing a root-only package holds it — the `vitest`
    fixture beside it resolves as `npm-dev` and could never have caught this.

16. **The bare-`Error` ban was switched off for `tests/harness/`**, on the ground that it is not
    shipped — making it the only directory in the repository where `throw new Error()` was legal,
    including for `PgEventStore`, which ADR-0020 promotes to `apps/api/` in Phase 5. → **Fixed
    now**: the harness has a local typed error, local because it deliberately carries no workspace
    dependency, and the ban is back.

17. **Four integration tests could not fail.** Both `caps pagination at MAX_PAGE_SIZE` seeded no
    rows and asserted a length of 0 — delete the cap and both stay green. Both list-projection
    tests asserted the absence of `tjm`, `cjm` and `margin`, spellings this codebase never uses, so
    a real leak named `tjmCents` would pass. `saves and retrieves a Cra with refusal` refused
    nothing; `updates status on re-save (upsert)` never re-saved. The refusal and validation
    columns of migration 002 were written by no test and read by no test. → **Fixed now**, and the
    lesson is the general one: a test named after a rule is not a test of that rule.

18. **The `reconstitute` factories accepted states the transitions cannot produce** — a validated
    Cra nobody validated, an issued invoice with no number — and were the only uncovered domain
    lines in the repository, under a threshold that passed at 96,3 %. → **Fixed now**: both refuse,
    in both directions, with a typed technical failure and fifteen unit tests. Domain coverage
    98,8 %. The threshold did not catch this and would not have: it measures a percentage of a
    surface, and the surface was mostly old code.

**Deferred, named rather than dropped:**

- **The transaction coordinator does not exist.** `hasCraBeenProcessed` (the application guard) and
  `saveDraft` (the constraint safety net) are tested independently. The caller that composes them —
  check, draft, save, persist event, all in one transaction — is **Phase 5**, in the Fastify route
  handler. Phase 3's integration tests prove each piece holds its invariant; Phase 5 composes them.
- **`CraRepository` has no `hasCraBeenProcessed` mirror.** The idempotency contract is on the
  **billing** side (has an invoice been drafted?), not on the timesheet side (has the CRA been
  validated?). A CRA that is validated twice is a domain question for `timesheet`; the
  no-duplicate-invoice question is `billing`'s, and it is answered here.

**Considered and left alone**: the `ON CONFLICT (id) DO UPDATE SET …` upsert in `#upsertInvoice`
does not conflict with the idempotency index because `draftInvoicesFrom` calls
`dependencies.newInvoiceId()`, which mints a fresh UUID. A replayed event creates invoices with new
IDs, which do not hit the `(id)` conflict target — they go straight to the `INSERT`, where the
idempotency index catches them. The path is: guard prevents it in normal flow, constraint catches
the race, typed error crosses the boundary. All three are tested.
