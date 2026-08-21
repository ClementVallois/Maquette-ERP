# BUILD-PLAN — from here to the finished mockup

**Written 17/08/2026.** `CLAUDE.md` states the intent, `docs/adr/` holds the reasoning,
`CONTEXT.md` fixes the vocabulary, `docs/BUILD-RULES.md` states what may and may not be written.
This file states **in what order it gets built, on which branch, and which ADR each step owes**.

`BUILD-RULES.md` is the parent: its "Build order" section is superseded by this file and becomes a
pointer to it (task 0.6). If this plan and an ADR disagree, the ADR wins and this file is wrong.

## Three decisions taken today, before any phase

1. **The working triage document leaves the public history.** `CHOIX.md` is purged from the
   history of all three branches before the first merge to `main` — the window closes at that
   merge. (`draft.md` needs no purge: it is gitignored and was **never committed** — verified
   17/08/2026, `git log --all -- draft.md` is empty. It is archived, not rewritten out.) Both
   survive as local files and in a separate private repository. This settles row 3
   of `docs/open-questions.md`, and it is **Phase 0, task 1**: every other phase is blocked behind
   it. **Consequence for this file**: nothing public may cite `CHOIX.md` by section number, because
   a cold reader cannot open it. This plan names decisions by **subject and by ADR**, and the
   coverage appendix keys to row titles with the private repository named as their source.
2. **The date moves, the scope does not.** `BUILD-RULES.md` already said so; it is now applied
   rather than quoted. Every retained item in `CHOIX.md` gets built. The 24/08 date is no longer a
   scope constraint — see "Calendar" below.
3. **The mockup is hosted, and the deploy is pull-based.** `erp.clementvallois.fr` on the personal
   VPS. The CI holds **no** VPS credential: the host pulls a signed image digest on a timer. This
   reopens rules that were settled as "there is no CD" and "no secret in CI" — the reopening is
   itself an ADR (Phase 8), not a silent edit.

## Calendar

Eleven phases, 0 through 10, sequenced by dependency. Sized honestly, this is **10–14 working days**, not 4. The
implied finish is therefore **early September 2026**, not 21/08.

What that means for the 24/08 conversation: phases 0–6 plus 8 constitute a **demonstrable chain in
production** — the CRA-to-invoice chain, the enforced boundary, authorization by role and scope, the
four screens, live at `https://erp.clementvallois.fr`. Phases 7, 9 and 10 harden and explain it.
If a link has to go out on 24/08, it goes out at the end of Phase 8, with the README saying plainly
what is finished and what is still being built. Nothing is cut; the reader is told where the work is.

**The fallback is named now, not improvised on the 23rd**: if Phase 8 itself has not landed by
24/08, what goes out is the **repository link**, with the README stating which phases are merged
and that the hosted instance follows within days. A working chain honestly described beats a rushed
deploy onto a host that also carries personal data — Phase 8's own ADRs exist precisely because
that host is not to be touched in a hurry.

---

## Conventions that apply to every phase

### Branches and merges

- One phase = one branch off `main`, named in the phase heading.
- Sub-tasks commit **directly on the phase branch**. A task is several commits; a commit is one step
  defensible out loud.
- A phase merges to `main` through a **pull request** using `.github/pull_request_template.md`, with
  every CI gate green and the phase checkpoint recorded. Merge commit, not squash: the commit history
  is part of the deliverable and squashing destroys it.
- `develop` is merged and deleted in Phase 0; CI triggers narrow at the same time.

### Commits

Conventional commits, scope from the closed enum in `commitlint.config.js` (extended in task 0.2).
**No `Co-Authored-By` trailer, ever** — enforced by `scripts/check-no-co-author.sh`.

### Dependencies and vocabulary — two rituals every task inherits

- **A new dependency is proposed, never just added.** Phases 3 and 5 introduce `pg`, `fastify`,
  `pino` and `zod`: each goes through the evaluation grid of `BUILD-RULES.md` (maintainers,
  activity, provenance, transitive weight, postinstall, licence), justified in the PR — and must
  clear the 7-day `minimumReleaseAge` quarantine, so the version to install is checked **before**
  the task starts, not discovered as a block mid-task.
- **Every new domain term enters `CONTEXT.md` in the same commit that first uses it** — the
  working rule already says a term is not used in code until it is in there, and this plan owes at
  least: `Period`, `HalfDays`, `Refused`, `Assignment`, `Grade`, `Cjm`, `Client`, `InvoiceLine`,
  `RegieDays`, the invoice statuses, `Persona`. A term in code that is absent from `CONTEXT.md` is
  a defect, not a shortcut.

### TDD — the policy, and where it is stricter than `BUILD-RULES.md` says

The instruction is TDD on **every** development, not only the domain. The "Working discipline"
section of `BUILD-RULES.md` currently limits it to domain invariants — "TDD on domain invariants
only … not on infrastructure". That rule is superseded in Phase 3 by **ADR-0019**, and the
resolution is asymmetric because the two halves are not the same exercise:

| Layer                          | Test written first                                                             | Runs in                       |
| ------------------------------ | ------------------------------------------------------------------------------ | ----------------------------- |
| `domain/`                      | Unit test, no database, fake `Clock`                                           | `test` (unit) — every push    |
| `application/`                 | Unit test against in-memory port fakes                                         | `test` (unit)                 |
| `infrastructure/` (SQL, repos) | **Integration test against real Postgres**, written before the SQL             | `test:int` — CI and on demand |
| API routes                     | Integration test hitting the route through `fastify.inject`, written before it | `test:int`                    |
| Screens                        | Integration test asserting the rendered HTML (status, key text, denied reason) | `test:int`                    |
| Deploy scripts                 | A dry-run assertion where one exists; otherwise a documented manual replay     | CI job / documented           |

Cost, stated rather than discovered: `pre-push` deliberately excludes Docker, so infrastructure TDD
runs locally on demand and in CI, not on the push hook. That stays true.

#### What the history shows about test-first

**Decided 18/08/2026, at the start of Phase 2**, on the row Phase 1's checkpoint opened for exactly
this date. Phase 1's preamble claimed "every step is red-green-refactor and the history shows it",
and the history cannot show it: every task commit carries the test and the implementation together,
so the order they were written in is not recoverable from git.

The claim is **narrowed to what is verifiable**, and the discipline is unchanged: the test is
written first, the commit carries both. Making the history show the red half would mean committing
a failing test, which contradicts the `pre-push` hook (it runs `test:cov`) and would leave a red CI
run on every branch push — a gate that is red by design is a gate nobody reads. Between a true
claim and a green pipeline that habituates the reader to red, the claim gives.

What that costs, said plainly: **"test written first" is a statement about the author's discipline,
not a property this repository proves.** Two Phase 1 guards were in fact written _after_ a coverage
report named them, which is honest work and is not test-first. Every claim in this build that a
reviewer can check is one this repository holds itself to; this one is now labelled as the kind
that cannot be, rather than left to be found.

### SOLID, OOP, DDD, Clean Architecture — the labels

The triage already settled the labels question, and it is **not** reopened by the instruction, which
itself deferred to that triage: SOLID is not claimed; OOP means encapsulation exactly
where an invariant must hold (`Cra`, `Invoice`) and plain functions and data everywhere else; DDD and
Clean Architecture are described as mechanisms, never worn as labels. DRY has two faces and both are
enforced: duplication is **required** at the documentary freeze (a line copies its `Tjm` and rate) and
**forbidden** on the authorization rule (one source). YAGNI is the sorting criterion, claimed out loud.

### The double checkpoint — ritual, home, and stop condition

At the end of **every sub-task (commit), every task, and every phase**, two questions, in order:

1. **Where and what am I least confident in, in what I just produced?**
2. **In three months, what breaks if I leave it as it is?**

Every point raised resolves to exactly **one** of four outcomes — never a silent pass:

- **fix now** — it is a defect, corrected in the same task before moving on;
- **new ADR** — it is a decision that was made implicitly and must be written down with its rejected
  option and its reconsideration threshold;
- **a row in the README's "Ce que je ne construis pas"** — it is out of scope, and the omission
  becomes deliberate and public;
- **a row in `docs/open-questions.md`** — it is real, it is not yet decidable, and the phase that
  will decide it is named with a date. This one carries an obligation the other three do not: an
  open row with no named phase is a deferral pretending to be a record.

The fourth was written in after the Phase 0 checkpoint, which produced two points that were none of
the first three — a measured discrepancy needing a decision, and a guard that cannot be built until
Phase 5 fixes the shape it would verify. The list said "three" while the paragraph below already
sent phase checkpoints to `open-questions.md`; the list was wrong, not the paragraph.

Phase-level checkpoints are **written down** in `docs/open-questions.md` (absolute dates, impact,
status; answered questions move to "Settled" with their answer). That file already exists for exactly
this and it puts the checkpoint in git history, which this repo treats as a deliverable. Commit-level
checkpoints are resolved in place and leave their trace in the commit itself.

A phase checkpoint also states, explicitly, **which tasks of the phase did not run and why** — an
unexecuted task that appears nowhere is the silent omission the build order forbids, and the
checkpoint is the last place it can be caught before the phase is called done.

Stop condition: a checkpoint ends when every point raised has one of the four outcomes recorded.
"Iterate until perfect" without that rule is unbounded; with it, it terminates.

### ADR numbering

`0005`, `0006`, `0007`, `0012`, `0013` are **reserved for their named subjects** and are consumed by
the phase that reaches them. Everything new starts at **0014**. Numbering is never reassigned; an ADR
is never rewritten — a changed decision gets a new one that supersedes it.

| ADR      | Subject                                                                    | Phase |
| -------- | -------------------------------------------------------------------------- | ----- |
| **0014** | The working triage document is kept out of a public history                | 0     |
| **0015** | The application shell lives in `apps/`, not in `packages/`                 | 0     |
| **0005** | Cra lifecycle, and where immutability binds                                | 1     |
| **0012** | The half-day is the single storage unit for recorded time                  | 1     |
| **0006** | Separation of duties: two rules, and where they are enforced               | 1     |
| **0016** | Typed errors: business versus technical, and how they reach the wire       | 1     |
| **0013** | The invoice line carries its origin, though only `Regie` exists            | 2     |
| **0017** | Mandatory legal mentions are modelled on the document, not templated       | 2     |
| **0018** | One series for invoices and credit notes, keyed `(entity, fiscal year)`    | 2     |
| **0007** | Gapless invoice numbering under concurrency                                | 3     |
| **0019** | TDD beyond the domain: integration tests written first                     | 3     |
| **0020** | `domain_events` as the audit journal, written in the same transaction      | 3     |
| **0021** | Idempotency: validating twice does not produce two invoices                | 3     |
| **0022** | The deterministic seed is a deliverable                                    | 4     |
| **0023** | Persona selector instead of authentication — persistence and CSRF included | 5     |
| **0024** | Structured logging, redacted by allowlist in the serialiser                | 5     |
| **0025** | HTML rendered without a template engine dependency                         | 6     |
| **0026** | One screen language, with centralised labels                               | 6     |
| **0027** | Nightly gates, and what the PR pipeline never runs                         | 7     |
| **0028** | The mockup is hosted — reopening "there is no CD, no secret in CI"         | 8     |
| **0029** | Pull-based deploy: no inbound credential, ever                             | 8     |
| **0030** | Isolation from the rest of the host                                        | 8     |
| **0031** | Reference data: per-module projections, the seed as single writer          | 1     |
| **0032** | The public instance is a resettable demo                                   | 8     |

0031 and 0032 were identified by the 17/08 review of this plan, after 0014–0030 were already
assigned. They keep their late numbers and are consumed by Phases 1 and 8 — the 0008–0011
precedent: a number records when a decision was identified, not where it sits in the build.

---

## Phase 0 — `chore/repo-hygiene`

**Blocks every other phase.** Task 0.1 must land before any merge to `main`, and tasks 0.2–0.4 block
the first commit of later phases — the commit-msg hook rejects `feat(api)` today, and
`vitest.config.ts` already references an `apps/**` that the workspace does not declare.

### 0.1 — Purge the triage from history, archive the working documents

- Back up `CHOIX.md` and `draft.md` outside the repo, and push them to a **separate private
  repository** (`Maquette-ERP-notes`), together with **`scripts/extract-triage.ts`, written in
  this task**: the script that counts the triage's verdict markers row by row. The coverage
  appendix of this plan and Phase 9's closing verification both key to its output, so it lives
  with the document it measures — referencing it without writing it would be the plan's own guard
  that guards nothing. ✅ **Written 17/08/2026** and run: its output is in the appendix, and it
  found the README's discarded-rows figure to be one commit stale.
- `draft.md` has **no history to purge**: it is gitignored and `git log --all -- draft.md` returns
  nothing (verified 17/08/2026). It is archived because a **verbatim third-party post** without
  attribution has no place near a public repo — but the rewrite below concerns `CHOIX.md` only.
- **Prerequisites**, verified 17/08/2026: `git filter-repo` is not installed
  (`pipx install git-filter-repo`), and it refuses to run on anything but a fresh clone — work
  from a fresh clone, or pass `--force` knowingly.
- Delete every local ref that carries the file **before** the rewrite, or it keeps purged blobs
  reachable and `git log --all` keeps finding them. `.claude/RESUME.md` names
  `refs/claude/checkpoint-72ced4ec`, and naming only that one was wrong: checked 17/08/2026, the
  file is in the tree of **`refs/claude/checkpoint-72ced4ec`, `refs/claude/checkpoint-4bd86d32`
  and `stash@{0}`** — the stash being a `WIP on main` from before the branch even existed. Enumerate
  rather than trust this list, since the tooling writes new checkpoint refs as it goes:
  ```sh
  for r in $(git for-each-ref --format='%(refname)' refs/claude refs/stash); do
    git ls-tree -r --name-only "$r" | grep -q '^CHOIX.md$' && echo "$r"
  done
  git stash list   # drop any that carry it
  ```
  Then delete the stale `RESUME.md` itself (local tooling, not a deliverable).
- `git filter-repo --path CHOIX.md --invert-paths` across `main`, `develop`,
  `feature/ci-pipeline`; then `git reflog expire --expire=now --all && git gc --prune=now`;
  verify with `git log --all -p -- CHOIX.md` returning nothing.
- **Seven commits touch only `CHOIX.md`** and must disappear with it — `a43155d`, `e2e17f5`,
  `5e447c4`, `0c559b5`, `b8f6565`, `425f98b`, `8c8542f` (each checked with `--name-only`,
  17/08/2026). `filter-repo` prunes empty commits by default; check all seven are gone, because a
  commit whose message describes a file nobody can see is the same defect as a section reference
  nobody can open. Their pruning also removes the four early non-conventional messages — a side
  benefit, not the goal.
- Verified before running: no surviving doc, ADR or README cites a commit SHA, so the rewrite
  breaks no internal reference.
- Force-push all three branches. **Human step**: this rewrites published history — confirm before
  the push. Two facts make the purge complete rather than cosmetic, and both must stay true until
  it lands: the repository is still **private**, and **no pull request has ever been opened** —
  verified 17/08/2026, `git ls-remote origin 'refs/pull/*'` is empty. GitHub keeps
  `refs/pull/N/head` forever; a single PR opened before the purge would defeat it.
- Move row 3 of `docs/open-questions.md` to "Settled" with the answer and the date.
- **ADR-0014**: rejected option = keeping it and saying so; threshold = a repository where the triage
  itself is the artefact being reviewed.
- Commits: `docs(docs): move the triage to a private repository` · `chore(repo): purge the working
documents from history` · `docs(adr): record why the triage leaves the public history`

### 0.2 — Open the commit scope enum

Add `api`, `web`, `seed`, `deploy`, `security` to `commitlint.config.js`. A closed list is the point;
it is extended deliberately, once, rather than bypassed per commit.

### 0.3 — Declare `apps/` in the workspace

`pnpm-workspace.yaml` globs `packages/*` only, while `vitest.config.ts` and `.dependency-cruiser.cjs`
already name `apps/**`. Add `apps/*`, add the boundary rules that apply to it (an app may import the
public index of any module; **no module may import an app**), and extend the whitelist so an
undeclared arrow still fails. **ADR-0015**.

### 0.4 — Make `.env.example` true

It still names `drizzle-kit` and `NEXT_PUBLIC_API_URL`, both contradicted by ADR-0009 and ADR-0011,
and its header says "never deployed", contradicted by decision 3 above. Rewrite it against the
decided stack. Add a `pnpm run env:check` assertion so the drift is caught rather than read.

### 0.5 — Branch model and CI triggers

Merge `feature/ci-pipeline` and `develop` into `main`, delete `develop`, narrow the CI `pull_request`
trigger to `main`, document the branch protection required checks in the README (a job that does not
block a merge is a warning, not a gate). ~~**Human step**: enabling branch protection in the GitHub
UI.~~ **That step was never available**: branch protection needs GitHub Pro or a public repository,
and this one is private on the free plan — found on 19/08/2026 when the first pull request was
opened. The eight gates are advisory until the repository goes public in Phase 9. **ADR-0040**.

### 0.6 — `BUILD-RULES.md` and `CLAUDE.md` point at this plan

Replace `BUILD-RULES.md`'s "Build order" section with a pointer here, so there is exactly one
ordering. `CLAUDE.md`'s schedule section was rewritten on 17/08 to defer to this plan's calendar —
the "code freeze 21/08 / ship 24/08" pair no longer described reality; commit that change and this
file in the same task.

**Phase checkpoint** → `docs/open-questions.md`.

---

## Phase 1 — `feat/timesheet-domain`

Pure TypeScript, no database, no framework. Every step is test-first, and the history shows the
test and the code arriving **together** — see "What the history shows about test-first" below.

### 1.1 — Value objects

`Period` (a Cra month), `Tjm` (whole euros, dated), `HalfDays` (integer count). `Money` is excluded
by ADR-0002 and stays excluded. Each is constructed through a factory that refuses an invalid state;
each refusal has a **negative test**.

### 1.2 — `DayType` and `WorkingCalendar`

`DayType`: worked, absence, public holiday, weekend. `WorkingCalendar` decides what is workable in
France (`Europe/Paris`, weekends, the fixed 2026 holiday table of ADR-0004). It is not a utility: it
decides what may be billed. Time comes from the injected `Clock`.

### 1.3 — The `Cra` aggregate and its lifecycle

`CraLine`, statuses `Draft → Submitted → Validated` plus `Refused`, no public setter, transitions
through intention-named methods. **ADR-0005** binds immutability: a `Validated` Cra is immutable, and
an attempt to change one is a typed business error naming the legal reason — a Cra is a record of
working time. **ADR-0012** fixes the half-day as the single storage unit: an integer count, never an
hour, never a float of days. `CONTEXT.md`'s `CraStatus` entry gains `Refused` in the same commit —
the enum in `cra-status.ts` already carries it, the vocabulary file does not.

### 1.4 — Reference data: who owns missions, assignments, and rates

The chain reads reference data everywhere — the submission checks below need assignments and
mission dates, billing will need the dated `Tjm`, the client and its territoriality — and no
earlier decision says where any of it lives. Since `billing` may import nothing from `timesheet`,
this is structural, and left undecided it gets improvised mid-task. **ADR-0031** decides it now:
**each module stores the projection its own rules read** (`timesheet`: consultants, assignments,
mission staffing dates; `billing`: clients and the mission's commercial terms), keyed by shared
UUIDs that the deterministic seed fixes — **the seed is the single writer of both sides**, which is
what makes the duplication safe. Rejected option: a third shared `reference` module and schema.
Threshold: the first **runtime** writer of reference data — an admin screen — or a third consumer
module. In this phase the decision shapes the domain model (what `timesheet` may know about a
`Mission`); Phase 3 gives it its tables, Phase 4 its rows.

### 1.5 — Submission checks

Each is a domain rule with a test: total consistent with the working calendar · no day on a finished
mission · no day on a non-existent assignment · weekend or public holiday flagged. Each has its
negative test.

### 1.6 — Validation, separation of duties, and the event

Validating publishes `timesheet.TimesheetValidated` (contract in `@erp/platform` — **revised in
this task before the first publish**). The contract was written before the model and contradicts it
in two places: the payload carries a single `missionId` while `CraLine` carries its `Mission` — one
validated Cra can span several missions, so the payload becomes a **per-mission breakdown** — and
`billableDays` is named in days while ADR-0012 fixes the half-day as the unit, so it becomes
`halfDays` counts. `DomainEvent` also gains `correlationId` and `causationId` here: 3.5 persists
them, and adding them after the first event ships means migrating history.

The test asserts "the event was published with this payload", with **no mock of `billing`** — that is
the property ADR-0001 bought. **ADR-0006**: whoever records a Cra does not validate it; whoever
validates does not issue the invoice. Two rules, no generic workflow engine.

### 1.7 — Typed errors

A business error (expected, part of the contract) or a technical failure (retryable). Never a bare
`new Error()` — the lint rule already forbids it; this task gives it something to point at.
**ADR-0016.** The mapping of each business error to its RFC 9457 problem type lives in `apps/api`
(Phase 5), **never in the modules**: the dependency-cruiser whitelist allows a module to import
`@erp/platform` only, and that stays true — a domain module does not import `@erp/contracts`. This
task defines the error types and names their problem-type identifiers; the wire mapping consumes
them later, on the side of the boundary where HTTP exists.

### 1.8 — Dated hierarchy resolution

The manager attachment is **dated**: March's Cra is validated by March's manager, even if the
consultant changed team in June. Same resolution mechanism as the dated `Tjm`, so it is the same code.

**Phase checkpoint.** PR to `main`.

---

## Phase 2 — `feat/billing-domain`

Still pure TypeScript. `billing` reacts to the event and knows nothing of `timesheet`.

### 2.1 — Line arithmetic

`(halfDays * tjmCents) / 2` — **multiply first, divide last** — with the assertion `tjmCents % 2 === 0`
at the single call site allowed to divide. Rounding is **half-up, named explicitly**, never a library
default. Reference tests fix the order of operations: quantity × unit price → round → group by rate →
VAT → round.

The lint rule `BUILD-RULES.md` already claims in the present tense — **no float-producing
arithmetic on money**: no `parseFloat`, no `Number()` on a decimal string, no `Math.round` used as
recovery — does **not** exist in `eslint.config.js` yet. It is written in this task, with a
negative fixture proving it rejects (same family as `__boundary-fixture__`). Until then that
sentence is a guard that guards nothing — the named failure family this repository exists to rule
out.

### 2.2 — The invoice line carries its origin

`InvoiceLine` carries `RegieDays` as an origin from day one, because the polymorphic line is what
retrofits worst. **ADR-0013**.

### 2.3 — VAT resolution and the dated rate table

The rate is **resolved** by a function of (service nature, place of taxation, customer status, date)
and then **frozen onto the line** — never typed in, never read back after issuance. The table is a
**dated reference**, not a constant: a rate change does not rewrite past invoices. Cases modelled and
tested: metropolitan rates · Guadeloupe/Martinique/Réunion at 8.5 % · Guyane/Mayotte as **out of
scope of VAT** (not a 0 % rate) with the CGI art. 294-1 mention · EU B2B taxable customer with
**Autoliquidation** and no French VAT. Rounding **per rate** (ADR-0010, already written).

### 2.4 — The invoice document

Draft invoice built from the event. Every **mandatory legal mention** carried by the model, not by a
template — including the late-payment rate, the early-payment discount mention **even to say there is
none**, the option "sur les débits", and the reform's four new fields (customer SIREN, delivery
address, operation category, débits option). Payment terms **validated** against the legal caps
(60 days from invoice date, or 45 days end of month). **ADR-0017**.

### 2.5 — Numbering, series, and the document state machine

One series for invoices **and** credit notes together, for chronological continuity, keyed
`(entity, fiscal year)` — calendar year today, but the key carries the entity because a retrofit would
renumber the whole history. **ADR-0018**. State machine: `Draft → Issued`, plus
`CancelledByCreditNote`; the statuses a certified platform would report back are **named, not built**.
`invoice-status.ts` already says `'credited'` where this plan says `CancelledByCreditNote`: the name
is settled here, recorded in `CONTEXT.md`, and the enum follows the vocabulary file — never the
other way round.

### 2.6 — Coherence check and `CreditNote`

Before an invoice leaves: `total HT = Σ lines` and `total TTC = total HT + Σ VAT per rate`. A mismatch
is a **typed refusal**, not a log line. `CreditNote` is the only correction of an issued invoice, with
a **typed reason**: entry error, commercial gesture, scope dispute, cancellation.

### 2.7 — The minimal `Client`

Reduced to what the fiscal rules need: SIREN, intra-EU VAT number, territoriality. No CRM pipeline.

**Phase checkpoint.** PR to `main`.

---

## Phase 3 — `feat/persistence`

`pg` with hand-written SQL and numbered `.sql` migrations (ADR-0011). **Integration tests written
before the SQL** — this is where ADR-0019 lands.

### 3.1 — ADR-0019, then the harness

Write **ADR-0019** first: TDD extended beyond the domain, what it costs (Docker for `test:int`, still
excluded from `pre-push`), and its rejected option (testing infrastructure after the fact against a
fixture). Then the integration harness: a real Postgres, a per-test transaction rolled back, no
Testcontainers (excluded, and the exclusion has a threshold).

⚠️ **Mechanical hole to close in the same task**: `vitest.config.ts` measures coverage on
`packages/*/src/domain/**` only, and the integration project has no coverage config and no threshold.
Shipping "TDD on infrastructure" on top of that is a guard that guards nothing — the named failure
family this repository exists to rule out. ADR-0019 must therefore either extend the coverage config
to the infrastructure layer with its own threshold, or state explicitly that integration coverage is
deliberately unmeasured and say what replaces it. Not left implicit.

The **CI job lands in this task, not in a later phase**: `test:int` against a Postgres service
container, added to the pipeline in the same PR that adds the harness. ADR-0019 says integration
tests run in CI; a Phase 3–6 sequence whose PR gates never touch a database would merge four phases
on the strength of a claim.

### 3.2 — Migrations

Numbered, additive `.sql` files, run by a small runner with a `schema_migrations` table. Per-module
schemas: `timesheet` and `billing` — the boundary visible down to the database. **Every foreign key is
indexed in the migration that creates it.** A worked day is a `date`, an event a `timestamptz`, never
a bare `timestamp`. Money is `bigint` cents. Ids are UUIDv7 generated in the application; the legal
`InvoiceNumber` is a separate field from the internal id.

Three mechanical facts this task must absorb:

- `package.json`'s `setup` and `db:reset` already call `pnpm run migrate`, **which does not
  exist** — this task creates it. Until Phase 4 adds `seed`, both commands stay broken; the PR says
  so rather than leaving the reader to find out.
- `docker/postgres/init/01-roles.sh` grants the app role's default privileges **in schema `public`
  only**. The migration that creates the `timesheet` and `billing` schemas must re-grant per
  schema, or the app role reads nothing and the first integration test fails on permissions
  instead of logic.
- The **migrations-replayed-twice CI job** lands here, with the runner it tests: applied to an
  empty database, then replayed. The additive rule is verified from the first migration onward, not
  asserted in a later phase.

### 3.3 — Repositories, and authorization inside them

`CraRepository` and `InvoiceRepository`. Authorization lives **here** (ADR-0003): three roles ×
`Office` scope, one rule, one source, never duplicated in a controller. `Cjm`, `Tjm` and margin never
appear in a list projection — only on the record. Pagination is **hard-capped**, including through
the API. Tests prove the refusal: a manager in Lyon reading a Bordeaux mission's margin gets a typed
403 with its reason.

### 3.4 — The transaction, and gapless numbering

Validating a Cra and drafting its invoice **commit together or not at all**: the domain event is
handled **inside** the transaction, and the subscriber's writes go through that **ambient
transaction** — what a subscriber may never do is I/O **outside** it: no network call, no second
connection, no disk. (Read literally, "no I/O" would forbid persisting the draft invoice; the rule
is about never leaving the transaction, and this task's tests pin that reading down.) Issuance
locks the counter row with `SELECT … FOR UPDATE` — **never a Postgres `SEQUENCE`**, because `nextval`
is not transactional and a rollback leaves a hole. **ADR-0007**, with a concurrency test that runs two
issuances in parallel and asserts no gap and no duplicate.

### 3.5 — `domain_events`

The persisted journal of emitted events, written in the same transaction, carrying `correlationId`
and `causationId`. It is what materialises the _piste d'audit fiable_ — the CRA → line → invoice
trail. **ADR-0020**.

### 3.6 — Idempotency

Validating the same Cra twice does not produce two invoices: a unique constraint on
`(source_cra_ids[1], billed_to_client_id)` in the draft table plus the domain guard, tested by
replaying the event. The constraint is composite, not single-column: ADR-0038 changed the
cardinality (one CRA, multiple clients, multiple invoices). **ADR-0021**, which also covers the
`Idempotency-Key` contract consumed in Phase 5.

**Phase checkpoint.** PR to `main`.

---

## Phase 4 — `feat/seed`

### 4.1 — The dataset

Deterministic: same seed, same identifiers, so screenshots, ADRs and the demo script do not go stale
at the first reset. Shape fixed by `CLAUDE.md`: 5 practices (audit, SOC, GRC, IAM, offensive) · 4
offices (Paris, Lyon, Rennes, Bordeaux) · `Regie` **and** `Forfait` missions, only `Regie` invoiced ·
one consultant in `Intercontrat` · one **PASSI** `Habilitation` constraining an assignment · a
Réunion client at 8.5 % · an EU B2B client under Autoliquidation · a Guyane client out of scope ·
`Grade` carrying the default `Tjm` grid · `Cjm` present as **the** sensitive value the scope test
protects. Synthetic and deterministic: no real name, no real `Tjm`. No volumetry mode.

### 4.2 — `db:reset` and the Zod-validated seed

This task creates the `seed` script that `setup` and `db:reset` have referenced since before this
plan — the first commit where both commands can actually succeed end to end. The seed input is
validated by Zod at its boundary. **ADR-0022**: the seed is a deliverable, not a fixture.

### 4.3 — CI replays `setup`

The job that runs `pnpm run setup` from a clean checkout lands **now, in the first PR where it can
pass** — not in a hardening phase. Without it the README's "Démarrer" is false by the third commit;
with it, every later phase inherits the proof that a cold reader can start the repo.

**Phase checkpoint.** PR to `main`.

---

## Phase 5 — `feat/api`

Fastify (ADR-0008), in `apps/api` per ADR-0015. Route tests written first via `fastify.inject`.

### 5.1 — Server shell and configuration

Zod schema validated **at startup**, failing immediately with a message that **names** the missing
variable and says what to do. No secret in an error, a log or a stack trace.

### 5.2 — Persona selector

Three personas (consultant, manager, billing) selected explicitly, **announced as such** in the UI and
the README: it makes authorization demonstrable in three clicks where a real IdP would make it
invisible. **ADR-0023**, naming the rejected option (a real OIDC provider) and its threshold — and
settling the two things a security-firm audience probes first, because the instance is public:
**how the persona persists** (a signed, `HttpOnly`, `SameSite=Strict` cookie — never a query
parameter, which leaks through logs and referrers) and the **CSRF stance** (`SameSite` plus an
origin check on every state-changing route; no token machinery for three personas, and the ADR says
why that is enough here and at what threshold it stops being enough).

### 5.3 — `/api/v1` routes

Versioned. Zod **at the boundary only** — it never replaces a domain invariant. Errors are RFC 9457
`problem+json` carrying the business field: validation → 400/422, violated invariant → 409,
insufficient scope → **403 with a reason**. `Idempotency-Key` on the single POST that issues a
numbered document. Pagination capped in the route as well as the repository. OpenAPI is deliberately
not generated (no third-party consumer) and that is written down.

**Progressive disclosure is API-side here** — the second of the two distinct controls the triage
retained (fields out of list views, task 3.3, is the first): `Tjm`, `Cjm` and margin are served
only by a **dedicated single-record read whose access is logged** — actor, field, target — through
the structured logger of 5.4. The extra request is the control: half a second for legitimate use,
prohibitive for scraping 800 records, and the log is what makes it attributable.

### 5.4 — Operations

`/healthz` with no dependency, `/readyz` that probes the database, graceful shutdown (server first,
then the pool). Structured logging with pino: JSON, `correlationId` and `causationId`, redaction **in
the serialiser by allowlist** so forgetting becomes impossible. **ADR-0024**.

**Phase checkpoint.** PR to `main`.

---

## Phase 6 — `feat/web`

Server-rendered HTML, no client framework, no front build step (ADR-0009). Tests assert the rendered
output before the template exists.

### 6.1 — Rendering, without a template engine

**ADR-0025**: how HTML is produced with no new dependency (tagged-template rendering with
escape-by-default), rejected option = a template engine, threshold = a second consumer of the same
markup.

Escaping is the security-relevant part, and this is the one place to be generous rather than minimal:
negative tests for **text context, attribute context (quoted and unquoted), URL context
(`javascript:` and `data:`)**, and an explicit, named opt-out for the rare markup that must pass
through raw — with a test proving the opt-out is the only route. In a cybersecurity firm's repository,
an XSS in the invoice screen is the one bug that discredits everything else in it.

### 6.2 — Route groups as personas, and the shared shell

Three persona route groups. One CSS file. French locale throughout: decimal comma, `JJ/MM/AAAA`, ISO
weeks from Monday, `Europe/Paris`. Labels centralised so they stay reviewable — **ADR-0026**: one
screen language, as a written choice rather than an omission.

### 6.3 — The Cra entry grid

A days × lines table with live totals. **No "copy last month"** — it copies last month's mistakes too.

### 6.4 — The _pré-facturier_

The central screen: what is billable, and for everything else the **explicit blocking reason**, plus
the late-days counter. `Tjm` and margin are **never in the table**: each sits behind an explicit
**reveal click**, no script, so the progressive-disclosure control is visible on screen and not only
in the API.

This paragraph used to say the reveal was "a plain link to the logged single-record read of 5.3".
It cannot be: `representationOf` (task 6.1) serves everything under `/api/` as `problem+json`, so a
browser following that link lands on a JSON document. **ADR-0052** makes the reveal a screen of its
own and moves the disclosure log inside the read, so a second caller cannot exist without one.
"Late days" was also specified nowhere — **ADR-0054** defines it before it becomes a column header.

### 6.5 — The invoice, and the printable Cra

The invoice as a printable HTML page carrying every legal mention (no PDF engine, and the exclusion
has its threshold). The validated Cra as a printable page for client signature — near-zero cost in
CSS, and it is the document that unblocks billing at large accounts.

### 6.6 — Empty, error, and permission-denied states

Deliverables, not polish: they are the proof the authorization model works. The denied page shows
**why**, from the `problem+json` reason. Filters live in the URL, so every view is shareable.

### 6.7 — Accessibility, reduced and stated

Full keyboard navigation, form labels, contrast. No RGAA audit, and that limit is written down.

**Phase checkpoint.** PR to `main`.

---

## Phase 7 — `ci/hardening`

The database jobs are **not** here: `test:int` in CI and migrations-replayed-twice landed with
Phase 3, the `setup` replay with Phase 4 — each with the code it tests, so no phase merged behind a
gate that proved nothing. This phase adds what deliberately does not run on every PR, and the
process around staying current.

### 7.1 — Nightly, and what the PR pipeline never runs

Stryker mutation testing on `domain/` **only**, nightly: the coverage threshold says _how much_, the
mutation score says _whether it proves anything_ — the direct answer to an agent-produced test that
asserts nothing. e2e, volumetry: never. **ADR-0027** writes the split and why the PR pipeline stays
short (a long pipeline gets bypassed).

### 7.2 — Renovate, and the written vulnerability process

Grouped, on a fixed cadence, Node and pnpm excluded from automation, vulnerability alerts at any time.
Being up to date is itself a control: nobody patches quickly from 200 versions behind. The same task
writes the **vulnerability-management procedure** the triage retained: what happens when
`pnpm audit --audit-level=high` blocks a merge — who decides, on what criteria an exception is
recorded, and where it is written. A gate with no procedure for its own red light gets disabled the
first time it fires.

### 7.3 — Branch protection: not here, and the reason is written down

This task **cannot run in Phase 7** and is not deferred so much as relocated. Branch protection
needs GitHub Pro or a public repository (**ADR-0040**, 19/08/2026), and the decision is to stay
private on the free plan until the repository goes public — which is Phase 9's call, not this
phase's. Scheduling the setting here would put an impossible step two phases ahead of the threshold
that makes it possible.

What Phase 7 still owes is the half that does not need the platform: the README's gate table stays
accurate as jobs are added, and it says the gates are advisory. That is already true as of ADR-0040.

The setting itself moves to **Phase 9**, alongside the decision to publish: eight checkboxes, free
on a public repository, recorded by the ADR that supersedes 0040.

**Phase checkpoint.** PR to `main`.

---

## Phase 8 — `feat/deploy`

The phase that reopens settled rules. The ADRs come **first**, before a line of deployment code.

### 8.1 — ADR-0028: the mockup is hosted

Records the reopening. The triage settled four rules on one premise — "there is no CD", "no secret in
CI", and hosting, artifact signing and runtime hardening deferred to the target ERP — and the premise
was that nothing is deployed. That premise is now false. The ADR names what replaces each rule and updates
`BUILD-RULES.md`, the README's "Renvoyé à l'ERP cible" list, and `.env.example`'s header in the same
pass — the decision itself moved, so ADR-0028 supersedes rather than edits (ADR-0045 draws that
line: a changed decision is superseded, a sentence that was never true is corrected in place).

### 8.2 — ADR-0029: pull-based deploy, no inbound credential

**Decision**: CI builds a multi-stage image and publishes it to GHCR by digest. A systemd timer on the
VPS polls for a new digest on the pinned tag and redeploys. The CI holds **no** SSH key, no VPS
secret, nothing.

**Rejected option**: push over SSH from the Actions runner. Shorter, and the common choice. It loses
because the host holds personal and intimate data unrelated to this project, and an inbound
credential in a CI runner is an inbound credential into that host. **Threshold**: a deploy needing
sub-minute latency, or an approval gate the timer cannot express.

### 8.3 — ADR-0030: isolation from the rest of the host

The host runs other services behind a systemd nginx, containers bound to `127.0.0.1`. This one is
tighter, and each control is written with what it defends against:

- a dedicated unix user `erp-deploy`, **not in the `docker` group** — docker group membership is
  root-equivalent on this box, and the box holds personal data;
- a narrow `sudoers` entry limited to the exact systemd units involved;
- the ERP Postgres in its **own compose project on a private docker network, with no published port
  at all** — not even on loopback, which is what the neighbouring services use;
- the container runs **non-root, read-only root filesystem, no new privileges, dropped capabilities**,
  from a minimal base image;
- an nginx vhost for `erp.clementvallois.fr` proxying to the app only, with security headers and a
  rate limit;
- secrets on the host in a root-owned file read by systemd `EnvironmentFile`, never in the repo,
  never in CI.

### 8.4 — ADR-0032: the public instance is a resettable demo

Anyone on the internet can act as any persona, so the data cannot be treated as durable — and
nothing so far said who seeds production or what happens to visitor entries. The decision: the
first deploy seeds the database, and a **nightly systemd timer resets it to the deterministic
seed** — visitor entries are demo exhaust, not state, and vandalism has a 24-hour half-life. The UI
carries a banner saying the data resets nightly, and the instance sends `X-Robots-Tag: noindex` (a
demo full of synthetic invoices has no business in a search index). Rejected option: durable data
with moderation. Threshold: a first real user.

### 8.5 — The image

Multi-stage Dockerfile, `pnpm deploy --prod`, non-root user, `HEALTHCHECK` hitting `/healthz`,
digest-pinned base. Built and published by CI on merge to `main`. Image provenance attestation
enabled — for a cybersecurity firm's repo, the supply-chain argument has to hold on itself.

### 8.6 — The host side

`compose.prod.yml` (app + Postgres, private network), the pull-and-redeploy script, the systemd
service and timer (plus the nightly reset timer of ADR-0032), a rollback path to the previous
digest, and a nightly `pg_dump` to a local restricted directory. The pull script is written with a
`--dry-run` mode that CI exercises, so it is not the one untested part of the chain.

Migrations run **before** the new container takes traffic, and the two-role split of Phase 3 holds in
production: the app container gets **only** the least-privilege `DATABASE_URL`, and the migration step
runs as a **separate one-shot container** holding the schema-owner credential, which lives in the
root-owned `EnvironmentFile` and is never present in the long-running app's environment. A migration
launched from the running application is the class of accident the two roles exist to remove; it must
stay impossible on the host too, not only on the laptop. The per-schema grants of 3.2 apply on the
host for the same reason: only the one-shot migration container's role can grant them — the app's
role never could.

### 8.7 — Human steps, gathered in one place

Not agent tasks, and named as such: the DNS `A` record for `erp.clementvallois.fr` · the Let's Encrypt
certificate (`/etc/letsencrypt/live` currently holds only the apex domain) · creating the `erp-deploy`
user and its sudoers entry · installing the systemd units · writing the production secrets file.
Delivered as a single guided script so the sequence is reproducible rather than remembered.

### 8.8 — What is deployed, said out loud

The README states plainly that the public instance holds **synthetic seed data only**, that it
resets nightly, that the persona selector replaces authentication, and that it must not be
presented as production-grade authentication.

**Phase checkpoint.** PR to `main`, then the first real deploy.

---

## Phase 9 — `docs/reader`

The repository has to explain itself to someone who opens it cold, with no brief.

### 9.1 — The README's empty sections

Architecture, Stack, Démarrer, Jeu de données, Tests et portes de CI — each written **after** its ADR
exists, never before. Plus the arguments already decided and owed to the README: the three billing
engines with only one built · the three denominators (jours ouvrés / productibles / facturables) ·
billing _à terme échu_ · the three horizons and the five decisions the tool makes decidable · the ROI
in DSO days, intercontrat days and TACE points · the "why not Odoo" answer · the honest limit against
a determined insider · the hosting/SecNumCloud question posed · the pipeline as an evidence factory ·
the compromise procedure (revoke first, rewrite history second — or never) · the e-invoicing calendar
with its caveat that it has already slipped.

### 9.2 — The cold reader's path

Five lines at the top of the README: README → one ADR → the test that proves the boundary → the
screen → the live instance.

### 9.2 bis — Going public, and the eight checkboxes that come free with it

The **disclosure decision** — whether this repository becomes public, and what saying so about
"the 24/08 conversation" discloses — is Clement's and is the open question of 18/08/2026. It is
named here rather than in 9.2 because 9.2 is about a reading path, not about publication.

If the answer is yes, two things follow in the same act and neither costs anything: branch
protection becomes available, so the **eight required checks** are ticked (the step Phase 7 could
not run — **ADR-0040**), and the Actions status becomes visible to anyone holding the link, so the
README can carry a CI badge instead of asking to be believed. A superseding ADR records both.

If the answer is no, ADR-0040 stands unchanged and the README keeps saying the gates are advisory.
That is a complete outcome, not a failure to reach one.

### 9.3 — `docs/demo.md`

The written scenario: seed → Cra entered → validated → draft invoice → out-of-scope read refused →
**boundary broken, CI red**. It is the demo script, and it is in the repo so it survives the demo.

### 9.4 — The ADR index and open questions, closed out

`docs/adr/README.md` regenerated: every ADR accepted, every reserved number consumed or explained.
`docs/open-questions.md` reviewed row by row; the e-invoicing calendar rechecked, as its own row asks.

**Phase checkpoint.** PR to `main`.

---

## Phase 10 — `chore/freeze`

### 10.1 — The final double checkpoint, over the whole deliverable

Run the two questions against the repository as a whole, not the last task. Each point: fix now, new
ADR, or a README row.

### 10.2 — Cold read, for real

Clone into an empty directory, follow the README with no other knowledge, and fix whatever breaks.
This is the only test of Phase 9 that counts.

### 10.3 — Tag and hand over

Tag the release, verify the deployed digest matches the tag, check the live instance against
`docs/demo.md` end to end.

---

## Appendix — coverage of the triage

The source is the triage document, held in the private `Maquette-ERP-notes` repository after Phase
0, measured by `scripts/extract-triage.ts` (written in task 0.1, archived alongside it).

**Measured 17/08/2026, and these are the figures that stand**: **478 rows — 64 already in the
repository, 88 "retained, to be built", 51 permanent rules, 33 already recorded elsewhere, 168
deferred to the target ERP, 74 discarded**, so **242 discarded or deferred**. They supersede both
earlier counts — this plan's first quote of 478/89/52/246 and the manual recount of ~479/88/51/243 —
which is exactly why the script exists. The manual recount had the two middle figures right and both
ends off by one. Sections 32 and 41 are excluded: they are source-coverage tables, not verdicts.

The README carried 246 until this measurement. The four rows are identified: the commit that
re-ranked the build order by dependency moved mutation testing, Renovate, progressive disclosure and
the dated manager attachment from discarded/deferred to "to be built", and the README figure did not
follow. Corrected there; recorded under Settled in `docs/open-questions.md`.

Rows are keyed here by **subject**, not by section number, because the section numbers point at a
document a public reader cannot open.

Every "to be built" row maps to a phase below. The **rules** are permanent and already live in
`BUILD-RULES.md`; they are enforced by every phase rather than built by one. The discarded and
deferred rows belong in the README's "Ce que je ne construis pas" and are closed out in Phase 9.

| Phase | Subjects discharged                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0** | Branch model (`main` + short branches) · `LICENSE` file · boundary declared as a whitelist, verified against `apps/` · the open-questions file, kept alive rather than created once                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **1** | Targeted value objects (`Period`, `Tjm`, `HalfDays`) · testability by event assertion · domain event vs integration event · dated business validity of the `Tjm` · refusal of retroactive correction · `Tjm`, `Cjm`, `Grade` in the model · dated hierarchical attachment · half-day entry granularity · entry checks at submission · **reference-data ownership: per-module projections, the seed as single writer (ADR-0031)**                                                                                                                                                                                                                                                                                                                                                               |
| **2** | Order of operations on a line · rounding mode (half-up, named) · VAT rounded per rate · document coherence check · single series for invoices and credit notes · fiscal year vs calendar year in the sequence key · the rate is not an attribute of the product · metropolitan rates · DOM with applicable VAT (8.5 %) · DOM out of scope of VAT · B2B territoriality and Autoliquidation · exigibility on débits · mandatory legal mentions · the reform's four new fields · capped payment terms · credit note with a typed reason · document state machine · polymorphic invoice line carrying its origin · minimal `Client` with the right fiscal fields · late-payment rate · early-payment discount mention · **the money lint rule made real (no float-producing arithmetic on money)** |
| **3** | `domain_events` journal · the three ports and no more · per-module Postgres schemas · UUIDv7 generated in the application · business reference vs technical id · idempotency of validation · RBAC plus `Office` scope · separation of duties · scope reduction by design · sensitive fields out of list views · capped pagination · atomic multi-table operation · integration tests and replayed migrations wired into CI                                                                                                                                                                                                                                                                                                                                                                     |
| **4** | Demonstration dataset as a deliverable · deterministic seed · protection of test data (synthetic, no real name or rate) · the CI job that replays `setup`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **5** | Application shape (server-rendered plus `/api/v1`) · server framework · data access · validation at the boundaries · authentication by persona selector · reduced observability (pino alone) · graceful shutdown · separate health and readiness · structured logger · redacted logs · correlation and causation ids · versioned API routes · `Idempotency-Key` on issuance · configuration validated at startup with immediate failure · **progressive disclosure: the logged single-record read of `Tjm`, `Cjm` and margin**                                                                                                                                                                                                                                                                 |
| **6** | Route groups as personas · the three feedback states · the refusal reason shown, not a greyed-out button · filters in the URL · Cra entry grid · printable Cra for client signature · the pré-facturier as the central screen · **the reveal click on `Tjm` and margin** · French formats and locale · reduced accessibility (keyboard, labels, contrast) · a front with no framework                                                                                                                                                                                                                                                                                                                                                                                                          |
| **7** | ~~Required checks and branch protection~~ (moved to Phase 9 — unavailable on this plan, ADR-0040) · mutation testing on `domain/` in nightly · grouped and scheduled Renovate · the written vulnerability-management process (the `setup` replay and replayed migrations moved to Phases 4 and 3, where the code they test lands)                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **8** | New scope, and a reopening: "there is no CD", "no secret in CI", build/deploy separation, artifact signing, runtime hardening and hosting were all settled on the premise that nothing is deployed. Each is re-decided against the new premise by ADR-0028/0029/0030 — built, or left deferred with the reason restated · **the resettable public demo and its seed lifecycle (ADR-0032)**                                                                                                                                                                                                                                                                                                                                                                                                     |
| **9** | The cold reader's path · `docs/demo.md` · the compromise procedure · plus every **rule** owed to the README: the honest limit against an insider, the pipeline as an evidence factory, the Cra as a legal document, the three billing engines, the five decisions and the prioritisation filter, the three horizons, the OCR arbitration, the notification rules, the go-live risk, build cost and ROI, the audit trail, the full commercial chain, the "why not Odoo" answer, mission reports out of scope, and the label positions (YAGNI claimed, SOLID not)                                                                                                                                                                                                                                |

**Verification, not assertion**: Phase 9 re-runs `scripts/extract-triage.ts` (from the private
repository, written in task 0.1) over the archived triage and
checks that no "to be built" row is unaccounted for. A row that turns out to be wrong rather than
merely unbuilt becomes an ADR and a README line — never a silent omission.
