# Open questions

What is **not** decided, with its impact and its date. An ADR records a decision; this file records
the absence of one. Absolute dates only. Nothing is deleted from here — a question that gets answered
moves down to "Settled" with its answer, so the record shows it was known rather than discovered.

## Open

| Since      | Question                                                                                                                                                                                                                                                                                                         | Impact if wrong                                                                                                                                                                                                                                            | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 17/08/2026 | The VAT rates, thresholds and mandatory mentions in ADR-0010 are those known on 17/08/2026 and have **not** been validated by an accountant.                                                                                                                                                                     | An invoice that is legally contestable. Bounded here because the mockup issues nothing to a real client, but it must not be presented as authoritative.                                                                                                    | Named in the README as requiring validation before any production use. Not blocking the mockup.                                                                                                                                                                                                                                                                                                                                                                                                      |
| 17/08/2026 | The e-invoicing reform calendar (reception 01/09/2026, emission for PME 01/09/2027) has already slipped several times.                                                                                                                                                                                           | An oral argument built on a date that moves.                                                                                                                                                                                                               | Cited with the caveat attached. Recheck before 24/08.                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 17/08/2026 | `scripts/boundaries.ts` cruises `apps/*/src/**/*.ts`. ADR-0015 declares the tier but no app exists yet, so the layout a real app will have is not fixed — an `apps/web/app/**` or `apps/api/lib/**` would not match that glob.                                                                                   | The boundary gate stays green on an application it never looked at. This is the exact failure the `totalCruised > 0` assertion exists to rule out, reintroduced one directory level down.                                                                  | The global `totalCruised > 0` check does not catch it: `packages/` alone keeps the count non-zero. Resolve **in Phase 5**, when the app's directory shape is decided, by asserting per workspace member rather than globally. Building the assertion now would guess the shape it is meant to verify.                                                                                                                                                                                                |
| 17/08/2026 | **The private archive of the purged triage has no remote.** `CHOIX.md` and `draft.md` now exist only in a local `Maquette-ERP-notes` git repository on one machine — the public history no longer holds them, by design.                                                                                         | Disk loss destroys the reasoning behind 478 arbitrations, and with it the only thing able to justify the two figures the README advertises. ADR-0014 names this exact shape as the option it rejected: "the same decision with the backup left to chance". | The purge ran before the archive was pushed, which inverts the intended order — accepted knowingly, with a full mirror of the pre-rewrite repository kept locally as well. Closing it needs a **private** GitHub repository named `Maquette-ERP-notes` and one `git push`; `gh` is installed but not authenticated. Owner: Clement. Before the repository goes public.                                                                                                                               |
| 18/08/2026 | **An `Intercontrat` consultant cannot submit a complete Cra.** The submission checks require every workable day of the month to be accounted for, a worked day names a mission, and `DayType` has no value for "staffed on nothing". The dataset `CLAUDE.md` prescribes contains one consultant in intercontrat. | The seed cannot produce a submittable Cra for that consultant, and the screen would show a month that can never be closed — on the one profile the dataset includes to look like a real firm.                                                              | Three candidate answers, none chosen: a fifth `DayType`; an internal non-billable mission the consultant is assigned to; or relaxing completeness to "no day over two half-days", which weakens the rule that catches an unaccounted month. Decide **in Phase 3, before the tables fix the shape** — a fifth day type is a column, and retrofitting it after the migration costs a second one.                                                                                                       |
| 18/08/2026 | **`docs/BUILD-PLAN.md` names "the 24/08 conversation" with no antecedent**, and `docs/open-questions.md` names an owner by first name and records a machine's `gh` auth state as a project blocker. A cold reader on `feat/billing-domain` hit both and could recover neither from anything in the repository.   | The plan's Calendar section — the part that says what ships and what the fallback is — rests on a date whose meaning is nowhere written, so the reasoning behind the fallback reads as arbitrary.                                                          | Not a defect to fix silently: saying what 24/08 is means disclosing, in a public repository, why this mockup exists and who it is for. That is a **disclosure decision, and it is Clement's**, not one to make on his behalf while writing the code. Two shapes are available — name it plainly, or replace every "24/08" with "the date the repository link goes out" and drop the definite article. Decide **in Phase 9** (task 9.2, the cold reader's path), before the repository link goes out. |

## Settled

| Settled    | Question                                                                                                                                                                                                                                                                                                                               | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
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
