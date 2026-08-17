# BUILD-RULES — the operative form of every decision taken

**Read this before writing code in this repository, at every step.** It is not background reading:
it is the checkable form of decisions already made. `CLAUDE.md` states the intent, `docs/adr/` holds
the reasoning, `CONTEXT.md` fixes the vocabulary — this file states what you may and may not write.

Every rule here comes from a decision that was made deliberately, and the structural ones have an ADR
naming the option rejected and the threshold for changing our mind. If a rule and an ADR disagree, the
ADR wins and this file is wrong; fix it. Nothing here may be relaxed for convenience — a rule that
blocks you is either right, or it needs a new ADR.

## Build order

Ranked by dependency, not by calendar. **Scope is not cut to fit a date** — the date moves, the scope
does not. Every retained decision gets built; this list only says what has to exist before what.

1. **The chain.** `Cra` aggregate → submit → validate → `TimesheetValidated` → draft invoice → issue
   with a gapless number. Domain first, tested without a database.
2. **The proof.** Authorization by role _and_ by `Office` scope; the immutability refusal; the
   invariant tests; per-module schemas; migrations; the deterministic seed in the shape `CLAUDE.md`
   fixes.
3. **The invoice, in full.** VAT resolved from territoriality and frozen onto the line, the four
   regimes, every mandatory legal mention, the reform's four new fields, payment-term caps,
   `CreditNote` with a typed reason, the document coherence check.
4. **The screens.** Cra entry grid, pré-facturier with explicit blocking reasons, the invoice, the
   refusal page, the empty and error states, the printable Cra.
5. **The surrounding proof.** `domain_events`, `Idempotency-Key`, structured logging with redaction,
   health and readiness, graceful shutdown, mutation testing on `domain/` in nightly, Renovate, the
   CI job replaying `setup`, migrations replayed twice, branch protection.
6. **The reader.** README sections, `docs/demo.md`, the cold-reader path, the demo script.

Nothing here is optional. If something turns out to be genuinely wrong rather than merely unfinished,
it becomes an ADR and moves to the README's "Ce que je ne construis pas" — never a silent omission.

## Money — non-negotiable

- A monetary value is an **integer number of cents**. In the domain, in the database, on the wire.
  No decimal library, no `Money` wrapper type (**ADR-0002**).
- **Never a float on a monetary value.** Every intermediate result stays an integer. If a computation
  cannot, stop: it means a decision changed and ADR-0002's threshold is reached.
- A `Tjm` is a whole number of euros, so `tjmCents` is a multiple of 100. Quantity is stored as an
  **integer count of half-days**.
- Line amount is `(halfDays * tjmCents) / 2` — **multiply first, divide last**. Exact because
  `tjmCents` is even, and the guard is an assertion that it is (`tjmCents % 2 === 0`), not a ban on
  `/`. Writing it as `halfDays * (tjmCents / 2)` is also exact today but inverts the safe order, so
  the rule is the one above.
- The lint rule therefore forbids **float-producing arithmetic on money** — no `parseFloat`, no
  `Number()` on a decimal string, no `Math.round` used to recover from one — and the division above is
  the single allowed one, at the single call site that asserts its precondition.
- **VAT rounds per rate, never per line and never on the total** (**ADR-0010**). Group lines by
  rate, compute and round once per rate, sum the rounded results.
- Rounding is **half-up**, named explicitly at the call site. Never a library default.
- Order of operations is fixed and covered by reference tests: quantity × unit price → round →
  group by rate → VAT → round.
- An issued invoice is checked before it leaves: `total HT = Σ lines` and
  `total TTC = total HT + Σ VAT per rate`. A mismatch is a typed refusal, not a log line.

## Boundary and layering

- `timesheet` and `billing` are sealed. `billing` imports **nothing** from `timesheet`; it
  subscribes to `timesheet.TimesheetValidated`, whose contract lives in `@erp/platform`
  (**ADR-0001**).
- The domain imports **nothing external** — no framework, no ORM, no network, no disk, not even a
  Node builtin. Enforced by dependency-cruiser, not by discipline.
- One `index.ts` per package is the only public surface.
- Layers per module: `domain` → `application` → `infrastructure`. Dependencies point inward only.
- A port is introduced only at the **second real implementation**. Three exist:
  `Clock`, `CraRepository`, `InvoiceRepository`. There is no email, storage or LLM port.
- Time in the domain comes from the injected `Clock`. `new Date()` and `Date.now()` are lint errors
  there — the fake clock is what makes dated invariants deterministic.
- No public setter: an object must not be able to exist in an invalid state.
- Never a bare `new Error()`. An error is **business** (expected, part of the contract) or
  **technical** (retryable).
- Every guard gets a **negative test** — a test that proves the rule _rejects_. A green gate that
  stopped looking is the one failure this repository exists to rule out.

## Domain invariants

- A `Validated` Cra is immutable. Attempting to change one is a typed business error, not a silent
  no-op. The legal reason is written down: a Cra is a record of working time.
- An issued `Invoice` is never modified. The only correction is a `CreditNote`, with a **typed
  reason** (entry error, commercial gesture, scope dispute, cancellation).
- Invoice numbering is sequential and gapless per `(entity, fiscal year)`: a row locked with
  `SELECT … FOR UPDATE` inside the issuing transaction. **Never a Postgres `SEQUENCE`** — `nextval`
  is not transactional and a rollback leaves a hole.
- One series for invoices and credit notes together, for chronological continuity.
- Validating a Cra and drafting its invoice **commit together or not at all**. The event is a
  domain event handled inside the transaction, which is exactly why a subscriber may perform **no
  I/O**. The day one does, an outbox is required — that is the threshold.
- Validating the same Cra twice does not produce two invoices.
- The VAT rate is **resolved** by a function of (service nature, place of taxation, customer status,
  date), then **frozen onto the line**. Never typed in by hand, never read back from the reference
  table after issuance. An invoice line **copies** its `Tjm` and rate; it does not reference them.
- A `Tjm` is dated: work done in June bills at June's `Tjm`.
- Submission checks are domain rules, each with a test: total consistent with the working calendar,
  no day on a finished mission, no day on a non-existent assignment, weekend or holiday flagged.

## Authorization

- Authorization lives in the **repository**, not in Postgres RLS (**ADR-0003**). It is never in a
  controller and never duplicated: one rule, one source.
- Three roles × `Office` scope. A manager reads their own office, never another's.
- Separation of duties, two rules only: whoever records a Cra does not validate it; whoever
  validates does not issue the invoice.
- `Cjm`, `Tjm` and margin never appear in a list view — only on the record. The asset being
  protected is the **aggregate**, so the control is on collection in volume, not on single access.
- Pagination is hard-capped, including through the API. There is no "show all".
- A refusal says **why**: RFC 9457 `problem+json` with the business field (violated invariant,
  missing scope, refusal reason). Validation → 400, violated invariant → 409, insufficient scope →
  403 with a reason. Empty, error and permission-denied states are deliverables, not polish.

## Stack — decided, do not substitute

Fastify · server-rendered HTML with no client framework and no front build step · `pg` with
hand-written SQL and numbered `.sql` migrations · Zod at the boundaries only · Vitest · pino ·
pnpm workspaces · a persona selector instead of authentication, announced as such.

**Not in this repository**, and the choice is written with its threshold: Redis, Kafka, RabbitMQ,
Elasticsearch, Terraform, Kubernetes, microservices, any ORM, any decimal library, any job queue,
React, Vue, PDF generation, OpenTelemetry, Testcontainers.

## Working discipline

- **Do not add a dependency.** Propose one, with the evaluation grid (maintainers, activity,
  provenance, transitive weight, postinstall, licence) and a justification in the PR. The 7-day
  quarantine and `ignore-scripts` stay on.
- Scope changes go to the README's "Ce que je ne construis pas", never into the code.
- One structural decision = one ADR, written **at the time**, naming the rejected option and the
  reconsideration threshold. Numbering is never reassigned; an ADR is never rewritten — a changed
  decision gets a new one that supersedes it.
- One commit = one step defensible out loud. Conventional commits, scope from the closed enum in
  `commitlint.config.js`. **No `Co-Authored-By` trailer, ever**, however the code was produced.
- Everything in English except `README.md`. French business terms stay French only where
  translation loses contractual or legal meaning; `CONTEXT.md` is the authority, and a term is not
  used in code until it is in there.
- Comment only a non-obvious **mechanical** fact — a trap, a footgun, a setting that silently does
  nothing. Reasoning belongs in an ADR; link to it instead of restating it.
- TDD on domain invariants only (they are testable without a database). Not on infrastructure.
- Every foreign key is indexed in the migration that creates it. Migrations are additive and are
  replayed twice in CI.
- A worked day is a `date`; an event is a `timestamptz`. Never a bare `timestamp`.
- Ids are UUIDv7 generated in the application, so an aggregate can be built without touching the
  database. The legal invoice number is a **separate** field from the internal id.
- Display is French locale: decimal comma, `JJ/MM/AAAA`, ISO weeks from Monday, `Europe/Paris`.
- No secret in a log, an error response or a stack trace. Redaction happens in the serialiser, by
  allowlist — never at the call site.

## Claimed out loud, and not claimed

Claimed: **YAGNI** (the sorting criterion), the CI-enforced boundary, exact monetary arithmetic,
authorization by role and scope, the CRA → line → invoice trail **as** the _piste d'audit fiable_.

Not claimed: **SOLID** (only two of five have teeth here, and they already have other names), DDD
and Clean Architecture as labels — the mechanisms are described, the words are not worn. If a
pattern name is used, it must be defensible down to the line of code that implements it.
