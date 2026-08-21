# Phase 4 & 5 closure — the reviewer findings and what each one owes

**Status: open. Phase 6 does not start until the "Blocking" column below is empty.**

**Progress, 21/08/2026.** Every finding whose outcome is **fix now** is resolved, on `feat/api`,
one commit each — the ✅ Resolved column names which. **Five blocking rows remain, and all five are
`new ADR` _(proposed)_**: P5-07c, P5-10, P4-06, P4-09, P4-10. `CLAUDE.md` reserves those
arbitrations to Clement, so this file cannot empty its own Blocking column; it can only reduce it
to the decisions that were always his. The sixth proposed ADR — the superseding note P5-11 owes
ADR-0043 — is non-blocking and also waiting.

This file exists because the two reviewers `CLAUDE.md` requires — `rules-auditor` and `cold-reader`
— did not run for Phase 4, and Phase 4 merged to `main` anyway. Phase 5's checkpoint recorded that
debt and refused to open a pull request because of it
([`open-questions.md`](./open-questions.md), § Phase 5). On **21/08/2026** all three passes ran and
the debt is discharged. What they found is written here rather than in the checkpoints, because a
checkpoint records what was true at the end of a phase and this is a **work list for the next one**.

It is deleted when it is empty. Until then it is the authority on what stands between here and
Phase 6.

## How these findings were produced

| Pass            | Range / target                                              | Result                              |
| --------------- | ----------------------------------------------------------- | ----------------------------------- |
| `rules-auditor` | `b0f304d...feat/api` — Phase 5, 8 commits, 83 files, +6,306 | 13 findings                         |
| `rules-auditor` | `af3b87a..b0f304d` — Phase 4, retroactive                   | 14 findings, **all live on `main`** |
| `cold-reader`   | the tree as checked out at `feat/api` (`0427b76`)           | 9 findings, covering both phases    |

Both auditors ran in a clean context with no memory of how the code was produced, which is the
point of them. The mechanical gates were green throughout on `feat/api`: `lint`, `boundaries`
(130 modules, 497 dependencies, no violation), `typecheck`, `format:check`, `test:cov` (379 tests,
99.2 % statements), `test:int` (77 tests). **Every finding below is something no gate looks at** —
which is the case the two reviewers exist to cover.

### What the reviewers cleared

Recorded because a finding list read alone misrepresents the branch. Phase 5 cleared, checked
rather than assumed: **money** (no float anywhere in `apps/api`; margin computed through
`billing`'s `lineAmountCents`, the single dividing call site, with its `tjmCents % 2 === 0`
precondition holding); **the sealed boundary** (`scripts/boundaries.ts` was strengthened, not
weakened — the `.dependency-cruiser.cjs` whitelist is untouched and no entry was added to make a
build pass; zero deep imports from `apps/api`); **the both-or-nothing transaction** (proven by a
test that injects a throwing `EventStore` and asserts the `Cra` stays `submitted` with zero invoice
rows); **both beats of ADR-0003**; **gapless numbering** (the counter is locked inside the
transaction the refusal rolls back, and a test proves a 409 burns no number); **stack**; and
**commit hygiene** (`commitlint` clean over the range, no `Co-Authored-By` anywhere). Phase 4
cleared money and the boundary in substance on the same standard.

The `cold-reader` verified the README's authorization claim **live**, end to end: `200` under
`manager-paris`, `403` with a named `deniedBy` and nothing published about the record under
`manager-lyon`, `404` for a nonexistent id, `403` on `/economics` for `billing-paris`, and the whole
chain through to `SEC-2026-000001`. Its verdict was that the code survives the walk and the README
does not.

## The four outcomes

Every point resolves to exactly one, per `CLAUDE.md` § The double checkpoint: **fix now** ·
**new ADR** · **a row in the README's "Ce que je ne construis pas"** · **a row in
`open-questions.md` with a named phase**.

Two conventions apply here specifically:

- **An outcome marked _proposed_ is not decided.** `CLAUDE.md` reserves architectural arbitration
  to Clement; where a finding needs an ADR, this file names the question, not the answer.
- **Blocking** means it stands between here and Phase 6. Non-blocking items still resolve to an
  outcome — they do not evaporate — but they can resolve into an open row rather than a commit.

## Ordering

The order is chosen so that each step is defensible out loud on its own, and so the riskiest change
lands while attention is on it.

1. **P5-04, P5-05, P5-02, P5-03** — the four Phase 5 defects. Correctness of the chain the whole
   mockup exists to demonstrate.
2. **P4-03, P4-07, P4-01** — the Phase 4 gates that assert nothing. They are on `main`, so every
   day they stand is a day the repository's central promise is unproven.
3. **CR-01 / CR-02 / CR-03 with P4-02, P4-05, CR-05, CR-06** — one revision pass over `README.md`.
   Doing these as one commit is deliberate: they are the same defect seen from six angles.
4. **The remainder**, each to its outcome.

---

## Phase 5 — `feat/api`

| ID | Sev | Where | Finding | Outcome | Blocking ✅ Resolved |
| ------ | ---- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- ---------- |
| P5-01 | — | `open-questions.md:714-721` | The two reviewers had not run. **Discharged 21/08/2026 by the three passes above.** The paragraph is now false as written and needs a superseding note — it is never deleted, per this file's own rule that nothing is removed from the record. | fix now | ✅ yes `9335ca8` |
| P5-04 | HIGH | `apps/api/src/chain/issue-invoice.ts:43-55` | The idempotency replay ignores **which invoice was asked for**. `findIssuedWithKey` is queried before `findById`, and `command.invoiceId` is never compared to `alreadyIssued.id`. A client reusing a key on a different draft gets `200 {replayed: true}` carrying **invoice A's** number, date and total, while invoice B is silently never issued. Contradicts ADR-0044 § Decision, "same key, **same invoice**". | fix now — one condition, plus the negative test whose absence is the finding underneath | ✅ yes `d99fd23` |
| P5-05 | HIGH | `apps/api/src/chain/issue-invoice.ts:68-70` | The **legal** invoice date is derived from UTC: `clock.now().toISOString().slice(0,10)`. On the `Europe/Paris` host of Phase 8, an issuance between 00:00–02:00 CEST stamps the previous day; on 1 January between 00:00–01:00 CET it takes **the previous fiscal year's series**, which is the numbering invariant. No zone conversion exists anywhere outside tests. Invisible today because the test clock is mid-day. | fix now. **Note the shape:** commit `92e85e2` caught this exact class two commits earlier and called it "the worst combination a date bug can have" | ✅ yes `dc1070b` |
| P5-02 | HIGH | `apps/api/src/chain/validate-cra.ts:89-94` | `Promise.all` over four reference reads on **one** checked-out `PoolClient`, inside the chain's transaction — `reference.billing()` alone issues three queries, so six-plus concurrent. `pg` queues them today; **`pg@9` removes the queueing** and the validation route throws. Every `test:int` run prints the deprecation warning, on the gate that is supposed to be the proof. Concurrency buys nothing here: one client serializes regardless. | fix now — sequential `await`s. The `Promise.all` is cost without benefit | ✅ yes `0af6d84` |
| P5-03 | HIGH | `packages/billing/src/infrastructure/pg-invoice-repository.ts:104, 123, 137, 170` | Four new repository methods — `findDraftedFrom`, `saveDeclinedDays`, `findDeclinedDays`, `findIssuedWithKey` — appear in **no** repository test. Exercised only indirectly through `apps/api`, always in-scope, always happy-path. The one that matters is `findIssuedWithKey`: ADR-0044 makes an explicit **security** claim about it (the replay lookup is office-scoped, so an actor who may not read the invoice cannot learn from this route whether their key was used on one). The guard is correct in the SQL and **no test asserts the refusal**. `saveDeclinedDays`'s `ON CONFLICT DO NOTHING` idempotency is claimed in migration 009 and never exercised twice. | fix now — positive **and** negative test each, per BUILD-RULES § Working discipline | ✅ yes `e426318` |
| P5-06 | MED | `packages/billing/src/infrastructure/pg-invoice-repository.int.test.ts:382-397` | The test hardcodes `sequence: 1` → `SEC-2026-000001` and collides with any pre-existing issued invoice. **Reproduced live during this review**: the suite passed, the `cold-reader` then issued `SEC-2026-000001` by following this branch's own verification procedure, and the next run went red on `duplicate key value violates unique constraint`. The harness rolls back what a test writes; it does not isolate against rows already there, and `UNIQUE` reaches across that boundary. Phase 5 is what made this reachable. | fix now — the error names neither cause nor fix, which is what makes it worth a commit rather than a row | ✅ yes `2acc2d5` |
| P5-08 | MED | `apps/api/src/routes/api.int.test.ts:237-252` | A test titled `"refuses a consultant a colleague's Cra"` whose body asserts **two 200s**. Nothing is refused. The property is genuinely covered at `packages/platform/src/scope.test.ts:77` and `pg-cra-repository.int.test.ts:131` — so the guard is proven — but the API suite a reader opens to check the README's claim reports a refusal it never performed. There is no second Paris consultant persona to perform it with. | fix now — either the title tells the truth, or the seed gains the persona that makes it true. `CLAUDE.md`: "no test that proves nothing" | ✅ yes `c5b17b6` |
| P5-09 | MED | `apps/api/src/persistence/columns.ts:18` | `exactCents` has three throw branches and **no test file**, while `packages/billing/src/infrastructure/columns.ts` — the copy this file's own doc comment says it duplicates — ships `columns.test.ts`. The reasoning was copied, the negative tests were not. It is the only decoder between a `numeric`/`bigint` column and `cjmCents`/`tjmCents` in the API tier. | fix now | ✅ yes `753a1ec` |
| P5-07a | MED | `docs/BUILD-RULES.md:111` | Says validation → **400**; ADR-0042 rules **422** for a value a domain rule refuses, and says so explicitly. BUILD-RULES' own preamble: "if a rule and an ADR disagree, the ADR wins and **this file is wrong; fix it**". | fix now — **BUILD-RULES is stale**, the code and the ADR agree | ✅ yes `4c4da42` |
| P5-07b | MED | `docs/BUILD-RULES.md:101` | Says authorization lives "never in a controller and never duplicated"; ADR-0023 has a third locus — the route **declares** its role as data. Verified: no handler body compares a role; enforcement is once, in `access.ts:123`. | fix now — **BUILD-RULES is stale**; the rule line should name the three loci | ✅ yes `4c4da42` |
| P5-07c | MED | `docs/BUILD-RULES.md:61-62` | "A port is introduced only at the second real implementation. **Three exist**: `Clock`, `CraRepository`, `InvoiceRepository`." Phase 5 added four — `Transactionally`, `EventStore`, `PersonaCatalogue`, `PgReadClient` — and **no ADR touches this**. `Transactionally` meets the rule's own criterion (two real implementations: pool and savepoint); the other three do not obviously. The enumeration is false either way. | **Decided 21/08/2026 — ADR-0047.** The criterion holds; two words were being read wrongly. "Real implementation" never meant "production" — `Clock` is the precedent — and on that reading `Transactionally`, `EventStore` and `PersonaCatalogue` each have a genuine second one in the tree, `EventStore`'s being the fault injection that proves the both-or-nothing transaction. `PgReadClient` is not a port: it is a structural narrowing of `pg`'s own signature. The **enumeration** is what was wrong, and it is removed | ✅ yes `ADR-0047` |
| P5-10 | MED | ADR-0023:124-128 vs `apps/api/src/routes/api.ts:140-168` | The scope matrix says `billing` gets `none` on `Tjm`; `GET /api/v1/invoices/:id` is `forRoles('manager','billing')` and returns lines carrying `unitPriceCents` and `origin.tjmCents`. **The code is right and the ADR is wrong**: BUILD-RULES § Authorization is satisfied exactly (rates never in a **list** view, only on the record), and billing cannot issue a document whose rate it may not read. The matrix collapses `Cjm`, `Tjm` and margin into one column whose justification is entirely about **cost**. | **Decided 21/08/2026 — corrected in place** (ADR-0045): the matrix now separates `Tjm` on a record from `Cjm` and margin, and says why the two are different assets. The route is unchanged, because it was right | ✅ yes `b92e2bd` |
| P5-11 | LOW | ADR-0043:102-105 and `open-questions.md:694` | Both describe `apps/api`'s SQL as read-only and confined to two files; `apps/api/src/persistence/pg-event-store.ts:36-40` does `INSERT INTO public.domain_events`. The code is fine — ADR-0020 promised the promotion and `eslint.config.js:297` names it. The two **statements** are false as written. | fix now for the `open-questions.md` row; ADR-0043 **corrected in place** 21/08/2026 (ADR-0045): three files, one of which writes | ❌ no `ed09c09` |
| P5-12 | LOW | `CONTEXT.md` | Three vocabulary gaps. **`Actor`** is in neither the glossary nor the checkpoint's explicit plumbing exemption, and it is on both modules' public ports — commit `e1ca623` says ADR-0023 arrives "with the two types it produces and the vocabulary entries they owe"; `Role` got one, `Actor` did not. **`session`** is on the public wire (`GET /api/v1/session`, `SESSION_SIGNING_KEY`) with no entry, while ADR-0023 § Decision says "no session store" — the glossary term for the thing is `Persona`. **`DeclinedDaysRecord`** is a second name for the glossary's `DeclinedDays`. | fix now — BUILD-RULES: "a term is not used in code until it is in there" | ❌ no `f4c1684` |
| P5-13 | LOW | `apps/api/src/routes/session.ts:73` | `type: '/problems/not-found'` hardcoded, in the one route file that does not import `API_PROBLEM_TYPES`. Every other site uses the constant; a rename drifts silently and nothing tests this branch's `type`. | fix now | ❌ no `345e980` |

## Phase 4 — `feat/seed` — **every finding below is live on `main` today**

The auditor's own summary: the seed is substantively good work — it drives the real aggregates, its
money is exact, its ADRs were written at the time and its checkpoint is unusually honest about six
things. **What it did not do is prove anything.**

| ID | Sev | Where | Finding | Outcome | Blocking ✅ Resolved |
| ----- | -------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- ---------- |
| P4-03 | HIGH | `.github/workflows/ci.yml:252-261` | The step is named `Run seed (second pass — must be idempotent)` and the commit says "prove idempotency". What runs is `pnpm run seed` twice, asserting only `exit 0` — and because `scripts/seed.ts:210-236` is DELETE-everything-then-INSERT inside one transaction, a second pass **cannot** fail. **Neither idempotency nor determinism is verified.** Concretely: replace `uuidv7Deterministic(...)` with `crypto.randomUUID()` and every one of the nine jobs stays green while ADR-0022's central claim — same seed, same database, the reason ADRs and screenshots may cite record ids — becomes false. | fix now — a row-count comparison, a checksum, or a golden id. BUILD-RULES: "a green gate that stopped looking is the one failure this repository exists to rule out" | ✅ yes `bf0f50c` |
| P4-07 | HIGH | `scripts/seed.ts:273, 306, 315, 324, 368` | Five collections — `legalEntityData`, `consultantGrades`, `gradeTjmDefaults`, `consultantHabilitations`, `missionHabilitations` — are inserted with **no** `validate()` call, while the other ten are validated. Contradicts commit `172742e` ("Zod validates all seed data at the boundary before any DB write"), ADR-0022 § Decision and BUILD-PLAN 4.2. **The unvalidated set is exactly where the money lives**: a `cjmCents: 250.5` skips the boundary and surfaces as a raw Postgres `check constraint violated`, not a typed refusal — in a repository whose § Money and § Boundary rules both exist to stop that shape. | fix now | ✅ yes `cbe5e66` |
| P4-01 | HIGH | `migrations/007-grades-and-habilitations.sql` | Six tables merged with **zero tests**, against BUILD-RULES § Working discipline and ADR-0019 ("every migration is tested by the time it merges"). The sharper half: lines 21 and 34 add **new guards** — `cjm_cents % 100 = 0`, `tjm_cents % 100 = 0` — with no negative test. Nothing proves a `cjm_cents` of 25050 is refused; **the constraints could be deleted from the file and all nine jobs stay green**. Migrations 001–006 are reached indirectly by the two repository tests; 007's tables have no repository and no reader, so it is the first migration where the rule had to be applied deliberately, and it wasn't. Not named in any of Phase 4's six checkpoint points. | fix now for the two guards' negative tests. **Also extend** the 19/08 open row about unused tables: it already calls two of them "the counter-example a reviewer picks up first", and Phase 4 added six more | ✅ yes `47d670b` |
| P4-02 | HIGH | `README.md:150-152` | Tells the reader `pnpm run seed` "n'existe pas encore" and that `setup` and `db:reset` therefore fail. **It exists, and all five steps of `setup` pass.** See CR-01 — the `cold-reader` reached this independently, from the opposite direction. | fix now, in the README pass (item 3 of Ordering) | ✅ yes `9c7183d` |
| P4-06 | MED | ADR-0041:61 and :37 | Line 61 states in the present indicative: "Every id in the database is a valid UUIDv7. No positional string, no v4." **False on the day it merged** — both repositories still mint positional child ids — in the artefact `CLAUDE.md` holds to the highest standard. _(That the ids are still positional is properly disclosed at `open-questions.md:27` with Phase 5 named; the ADR's own text is not.)_ Line 37 prescribes "the repositories import from `scripts/lib/`", which **cannot happen**: `packages/billing/tsconfig.json` sets `rootDir: "src"`, so the climb fails the per-package `tsc --noEmit` the `quality` job runs. **The ADR is wrong; BUILD-RULES is right and needs no change.** | **Decided 21/08/2026 — corrected in place** (ADR-0045). Line 61 became true when Phase 5 delivered it and needed no edit; the `scripts/lib/` prescription is replaced by what the code does — the generator lives at the composition root and a repository is **injected** a factory, because `rootDir` forbids the climb. A third false sentence was corrected with them: child-row identity is not stable across a re-save | ✅ yes `b92e2bd` |
| P4-05 | MED | `README.md:181, 184, 193, 206, 215, 219` | Five occurrences of "les huit" plus "huit cases à cocher", and an 8-row gate table with no **Cold setup (migrate + seed)** row. `ci.yml:197` adds a ninth job. The sequence matters: the ADR-0040 pass rewrote that whole section **for gate honesty**, and the seed commits then added a job behind it. The one section written to be checkable is off by one. | fix now, in the README pass | ✅ yes `9c7183d` |
| P4-04 | MED-HIGH | `migrations/007:6,15,21`, `scripts/lib/seed-data.ts:46-52,185` | `Grade` and `Cjm` used in code at `c066693` and `5e07a3a`; entered `CONTEXT.md:115-121` only at `7db6a4b`, three commits later. `BUILD-PLAN.md` pre-names **these two terms specifically** and pre-declares the outcome: "every new domain term enters `CONTEXT.md` in the **same commit** that first uses it… a defect, not a shortcut". The checkpoint presents it as an achievement without noting the inversion. | fix now — a correcting line in the Phase 4 checkpoint. The terms are in the glossary now; what is wrong is the record | ❌ no `6583e52` |
| P4-09 | MED | `CONTEXT.md:123-125` vs `scripts/lib/seed-data.ts:437-443, 555-561` | The glossary says `Intercontrat` is "a consultant currently **staffed on no mission**"; the seed staffs Inès on an open-ended `Forfait` mission literally named `Intercontrat`. The modelling choice is well-reasoned and **is** recorded (`open-questions.md:44`, settled 18/08, rejected options named) — but two current documents now say opposite things, and the glossary is the declared authority. Separately, that row is a **settled row, not an ADR**, for a decision that shapes the domain's completeness rule and interacts with ADR-0037, and it names **no reconsideration threshold**, which `CLAUDE.md` requires of every structural decision. | **Decided 21/08/2026 — both.** ADR-0046 promotes the settled row and gives it the threshold it lacked; `CONTEXT.md` gains the mechanism, so the glossary and the seed stop saying opposite things | ✅ yes `ADR-0046` |
| P4-10 | MED | `scripts/seed.ts:558-604, 676-741` | The seed drives the aggregates and then **writes the rows directly**, duplicating the mapping owned by `CraRepository` and `InvoiceRepository` — with a 27-column INSERT under the comment "column order matches pg-invoice-repository.ts". ADR-0022 § Decision says it "drives the domain aggregates rather than writing rows directly". **The drift is already measurable**: the repository writes `issuance_idempotency_key`; the seed's INSERT does not. Nothing mechanical keeps them in step — the comment _is_ the check. Add a NOT NULL column and the seed fails at demo time, not at test time. | **new ADR** _(proposed)_ — either the seed goes through the ports, or the duplication is a decision with a threshold. No ADR, no checkpoint row, no test on the duplicated mapping today. **Found 21/08/2026 while fixing P4-11, and it belongs to this row:** the seed prints "2 mission(s) declined" and writes **zero** rows to `billing.declined_days` — it never calls `saveDeclinedDays`, because it does not go through the port that has it. So the pré-facturier's blocking-reason column is empty from a fresh seed, and the concept ADR-0037 exists for is invisible in the demo. This is the drift the row predicts, already measurable a second time | ✅ yes — _(Clement)_ |
| P4-11 | LOW-MED | `scripts/seed.ts:217-218` | `DELETE FROM billing.declined_days WHERE FALSE` and the same for `credit_notes` — a reset step that clears nothing. **Phase 5 starts writing `declined_days`.** On the day it merges, stale rows accumulate across seed runs and ADR-0022's determinism breaks in the one place no gate is looking — P4-03 guarantees the CI job cannot see it either. This is the double checkpoint's second question ("in three months, what breaks?") with a concrete answer, and it was not asked. | fix now — **and it must land with, or before, Phase 5**, since Phase 5 is what arms it | ✅ yes `1b06bbe` |
| P4-08 | MED | `.github/workflows/ci.yml:224-261` vs `package.json:16` | BUILD-PLAN 4.3 asks for "the job that runs `pnpm run setup` from a clean checkout… without it the README's 'Démarrer' is false by the third commit". The job **re-implements** the four sub-commands against a `services:` container. The substitution is defensible (no `docker compose` under a service container) but the composite script the README points a reader at is **never executed by CI** — the one guarantee 4.3 buys. A `setup` broken by a typo in `package.json` ships green. Not recorded: the checkpoint says "every task of the phase ran". | **row in `open-questions.md`** _(proposed)_, phase to be named — the constraint is real and the workaround may be the right answer | ❌ no `3238113` |
| P4-13 | LOW-MED | `scripts/boundaries.ts:3` | `GLOBS` covers `packages/*/src/**` and `apps/*/src/**`. `scripts/seed.ts` (815 lines) is the first file in the repository to import `@erp/timesheet` **and** `@erp/billing` — a de-facto composition root outside `apps/`. Its imports are package-root and correct today, so no rule is broken; but the gate the README calls "la moitié la plus facile à perdre" never sees it, and a future deep import would cruise clean. `boundaries.ts:26-32` shows the author already reasoning about exactly this failure one directory over. | fix now — extend the glob | ❌ no `7cafc46` |
| P4-12 | LOW | `scripts/lib/uuidv7.ts:69-79` | The comment says "big-endian 64-bit value across the 10 bytes". **False as a mechanical fact**: JS bitwise shifts are mod 32, so `counter >> 56` evaluates as `counter >> 24`; `suffix[2..5]` and `suffix[6..9]` get the same four bytes and only the low 32 bits are written. The **code is correct** — uniqueness holds below 2³², and the seed's counters reach ~2040 — so this is the comment. BUILD-RULES allows a comment only for "a non-obvious mechanical fact — a trap, a footgun"; this one names the footgun and gets it backwards, in the file whose stated reason for being hand-written is that it is simple enough to get right. There is also **no test anywhere** under `scripts/`: nothing asserts the version nibble is `7` or the variant bits are `10`. | fix now — correct the comment, add the generator's tests | ❌ no `55e9d72` |
| P4-14 | LOW | `scripts/seed.ts:519-535` | Every workable June day is `worked`, `halfDays: 2`, on `activeAssignments[0]`. Consequence: `timesheet.cra_flags` is **never populated**, so neither the persistence path nor the demo can show a flagged Saturday — the concept `CONTEXT.md:51-53` describes at length. No `absence` day exists. And Alice holds two assignments, the natural split, yet no day is split — so the dataset never exercises the one structural reason `CONTEXT.md:15-17` gives for putting the mission on the **line** rather than the day. `CLAUDE.md` § Dataset shape's named checklist items are all present; this is the layer below them. | **row in `open-questions.md`** _(proposed)_, named for the phase that needs the demo data — likely Phase 6 or 9 | ❌ no `3238113` |

## Cold-reader — the README

> "The code survives the walk outright. What does not survive is the README's account of itself."
> — and, on the HTTP surface it eventually found: **"the door is unmarked."**

CR-01 is P4-02 and CR-06 overlaps P4-05; they are listed once here and once above because the two
reviewers reached them independently, which is the strongest signal in the set.

| ID | Sev | Where | Finding | Outcome | Blocking ✅ Resolved |
| ----- | ---- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | -------- ---------- |
| CR-01 | HIGH | `README.md:150-155` | The seed lie. **The only finding that costs the reader a working chain rather than comprehension**: a stranger follows "Démarrer", runs `db:up` + `migrate` + `test:int`, ends with an **empty database**, never sees a CRA or an invoice, and concludes the chain is not built. The sentence "C'est écrit ici plutôt que découvert à l'exécution" is the exact inversion of what happens. False on `main` too. | fix now | ✅ yes `9c7183d` |
| CR-02 | HIGH | `README.md` (absence) | **The entire HTTP surface is unreachable from the README**: zero hits for `pnpm run api`, `apps/api`, `/api/v1`, a port, a URL, or how to select a persona. "Persona" appears once, at line 131, buried in "Hors périmètre" as a scope disclaimer. Yet **line 88 describes HTTP behaviour as demonstrated fact** — 200, 403, `deniedBy`, 404. The README asks the reader to believe a demonstration it gives them no way to run; the reviewer reached it only by opening `package.json`, a file the README never names. Once found, the surface is genuinely self-describing — which is what makes this a defect of the **path, not the thing**. | fix now | ✅ yes `9c7183d` |
| CR-03 | HIGH | `README.md:7, 30-33` | The status header is false and, on `feat/api`, **self-contradicting**. Line 30 says "ce qui n'existe pas encore : le jeu de données (phase 4), l'API (phase 5)" — Phase 4 is on `main`, Phase 5 is this branch. Lines 31-33 send the reader to point 3 "qui dit exactement où passe la ligne"; point 3, rewritten by Phase 5, says the opposite. **`README.md` differs from `main` by three lines** — the Phase 5 edit was local and everything above it was left unread. | fix now | ✅ yes `9c7183d` |
| CR-05 | MED | `README.md:144, 148, 173` | Three `_(à écrire)_` sections whose stated precondition **has been met**. **Architecture** — ADR-0001, 0003, 0015 written _and_ implemented. **Stack** — ADR-0008 (Fastify), 0009, 0011 all decided; **a stranger cannot learn from the README that this is a Fastify app**. **Jeu de données** — lists exactly what the seed now prints. `CLAUDE.md`'s rule is one-directional (don't write what isn't true **yet**) and the README is obeying it past its expiry. | fix now | ✅ yes `9c7183d` |
| CR-06 | MED | `README.md:15, 19, 183, 23-28` | Four stale counts: "six migrations" → **9**; "43 tests d'intégration … sur 307" → **77 + 379 = 456**; "huit jobs / les huit sont vertes" → **9** (see P4-05); "deux fichiers franchissent délibérément une frontière" → `tests/boundary-rule.test.ts` cruises **seven fixture globs across six directories**. | fix now | ✅ yes `9c7183d` |
| CR-04 | MED | `open-questions.md` § Phase 4 | The recorded reason for skipping the `cold-reader` — "Phase 4 is data and a CI job, not domain code or a README change, **so the cold-reader's surface is unchanged**" — is itself the reason it was needed. Phase 4 shipped `pnpm run seed` (CR-01) and a ninth CI job into a table presenting eight as exhaustive (CR-06). **Both falsehoods reached `main` because that sentence was believed.** _(Recorded as a finding about reasoning, not about the README. The reviewer noted Phase 5's checkpoint is by contrast exemplary — it names the debt, refuses the PR, and resolves eleven points against the four outcomes.)_ | fix now — a correcting line in the Phase 4 checkpoint, alongside P4-04 | ❌ no `6583e52` |
| CR-07 | MED | `.env.example` + startup log | The server logs `Server listening at http://127.0.0.1:3000`; `.env.example` ships `API_HOST=127.0.0.1` with `API_PUBLIC_ORIGIN=http://localhost:3000`. Verified both ways: `Origin: http://127.0.0.1:3000` → **403 `/problems/forbidden-origin`**; `localhost` → 200. Today it only bites someone who found `pnpm run api` unaided. **It will bite every reader in Phase 6**, when the screens exist and that log line is the URL they click. | fix now — the log line and the configured origin must agree | ✅ yes `90b55a0` |
| CR-08 | LOW | `README.md:88` | `manager-paris` / `manager-lyon` appear with no definition and no pointer. `CONTEXT.md` **does** define `Persona` and `Role`, and well ("it is called a persona and not a user because nothing about it is authenticated") — but the README's only pointer to the glossary is fifty lines earlier and advertises different terms. Related: the French README links a French reader to an English glossary without warning that the link changes language. The deliberate-exception rule covers the language; the absence of the warning is the friction. | fix now, in the README pass | ❌ no `9c7183d` |
| CR-09 | LOW | `README.md:70`, `:70` vs `:177-194` | `packages/contracts` exists; the README accounts for one shared package. And ADR-0040's disambiguation ("the gates are advisory") sits **110 lines after** the claim at line 70 that breaking the boundary "doit faire échouer la CI" — a reader who stops at "what this proves" leaves with the wrong model. Also: `docs/BUILD-RULES.md` is never linked from the README. **Empty states are unobserved, not absent** — no seeded persona yields an empty list; Phase 6 owns the screens where it will show. | fix now for the first three; the empty state is a **row in `open-questions.md`**, Phase 6 | ❌ no `9c7183d + 3238113` |

---

## What closes each phase

**Phase 4 closes** when P4-01, P4-02, P4-03, P4-06, P4-07, P4-09, P4-10 and P4-11 are resolved —
noting that all of them are on `main`, so the fixes land as their own branch rather than inside
`feat/api`, **except P4-11**, which Phase 5 arms and which must therefore land with it.

> **Deviation, 21/08/2026: every Phase 4 fix landed on `feat/api` instead.** Recorded here rather
> than done quietly, because a plan departed from without a note is the defect three findings in
> this very file are about.
>
> Two of them **cannot** be fixed on `main` as this paragraph assumes. P4-12's wrong comment is in
> `scripts/lib/uuidv7.ts` on `main` and in `apps/api/src/ids/uuidv7.ts` here — Phase 5 moved the
> file and gave it the tests P4-12 also asked for. P4-13 is only _reachable_ because
> `scripts/seed.ts` imports `@erp/api`, which is a Phase 5 import. A third, P4-03, has to observe
> the seed **as Phase 5 leaves it**: its proof is a fingerprint of the seeded database, and
> freezing one against `main` would break at the merge.
>
> A separate branch would therefore have carried five of the eight and conflicted with this one on
> the other three. The fixes reach `main` in the same merge as Phase 5, which is the next merge
> either way.

**Phase 5 closes** when P5-01 through P5-10 are resolved and the branch merges. It is currently
unmerged with no pull request open, by its own checkpoint's decision. P5-01 through P5-09 and
P5-11 through P5-13 are resolved; P5-07c and P5-10 are Clement's.

**The README pass** (CR-01, CR-02, CR-03, CR-05, CR-06, CR-08, CR-09, P4-02, P4-05) is one commit
and is the last thing to land before the merge, since it must describe the repository as it will
then be. **Done, `9c7183d`**, and its "Démarrer" section was walked end to end against a live
instance before it was written down rather than after.

**Phase 6 starts** when the Blocking column is empty and this file is deleted. As of 21/08/2026 it
holds five rows, all of them decisions rather than defects.

## What this file is not

It is not a substitute for the phase checkpoints in [`open-questions.md`](./open-questions.md),
which stand as written — including the Phase 5 paragraph at `:714-721` that says the reviewers had
not run. That paragraph was true when written and is now superseded; P5-01 is the row that fixes
the record. Nothing is deleted from that file, by its own rule.

Nor is it a decision. Six items are marked **new ADR _(proposed)_** — P5-07c, P5-10, P4-06, P4-09,
P4-10, and the superseding note in P5-11. `CLAUDE.md` reserves those arbitrations to Clement, and
this file names the question so the decision has something to answer.

**As of 21/08/2026 those six are the whole remainder.** Everything else is resolved and its commit
is named in the ✅ Resolved column. The half of P5-11 that is a factual correction to
`open-questions.md` was made (`ed09c09`); the half that is a superseding note to ADR-0043 was not,
for the same reason as the other five. What each one needs, in one line:

| Row        | The question, stated so it can be answered yes or no                                                                                                                                                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P5-07c** | Does "a port is introduced only at the second real implementation" still hold, now that Phase 5 added four ports and only one meets it — and what is the rule for a port introduced at a composition root?                    |
| **P5-10**  | ADR-0023's scope matrix gives `billing` `none` on `Tjm`; the route serves it on the record and is right. Superseding note correcting the matrix, or a different reading?                                                      |
| **P4-06**  | ADR-0041 states two things that are false as written. Superseding note, and does it also restate where the shared id generator lives now that `rootDir` forbids the climb?                                                    |
| **P4-09**  | `Intercontrat` is glossed as "staffed on no mission" and the seed staffs Inès on a mission named Intercontrat. Does the glossary gain the internal-mission mechanism, or does the settled row become an ADR with a threshold? |
| **P4-10**  | Does the seed go through the repository ports, or is writing rows directly a decision with a threshold? The `declined_days` gap above is the second measurable drift.                                                         |
| **P5-11**  | The superseding note ADR-0043 owes about `apps/api`'s SQL — non-blocking, and the only one of the six that is purely a record correction.                                                                                     |
