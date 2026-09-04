# BUILD-RULES — the operative form of every decision taken

**Read this before writing code in this repository, at every step.** It is not background reading:
it is the checkable form of decisions already made. `CLAUDE.md` states the intent, `docs/adr/` holds
the reasoning, `CONTEXT.md` fixes the vocabulary — this file states what you may and may not write.

Every rule here comes from a decision that was made deliberately, and the structural ones have an ADR
naming the option rejected and the threshold for changing our mind. If a rule and an ADR disagree, the
ADR wins and this file is wrong; fix it. Nothing here may be relaxed for convenience — a rule that
blocks you is either right, or it needs a new ADR.

## Build order

**[`docs/BUILD-PLAN.md`](./BUILD-PLAN.md) holds the order, and holds it alone.** It names the phases,
the branch each one runs on, the ADR each step owes, and the dates. This section used to rank the same
work into six dependency buckets; two documents describing one ordering is one document too many, and
the coarser of the two is the one that goes (task 0.6 of the plan).

What stays here is the rule the ordering obeys, because it is a rule and not a schedule:

**Scope is not cut to fit a date** — the date moves, the scope does not. Nothing in the plan is
optional. If something turns out to be genuinely wrong rather than merely unfinished, it becomes an
ADR and moves to the README's "Ce que je ne construis pas" — never a silent omission.

## Money — non-negotiable

- A monetary value is an **integer number of cents**. In the domain, in the database, on the wire.
  No decimal library, no `Money` wrapper type (**ADR-0002**).
- **Never a float on a monetary value.** Every intermediate result stays an integer. If a computation
  cannot, stop: it means a decision changed and ADR-0002's threshold is reached.
- A `Tjm` is a whole number of euros, so `tjmCents` is a multiple of 100. Quantity is stored as an
  **integer count of quarter-days** (**ADR-0069**, superseding the half-day of ADR-0012).
- Line amount is `(quarterDays * tjmCents) / 4` — **multiply first, divide last**. Exact because
  `tjmCents` is a multiple of four, and the guard is an assertion that it is
  (`tjmCents % 4 === 0`), not a ban on `/`. Writing it as `quarterDays * (tjmCents / 4)` is also
  exact today but inverts the safe order, so the rule is the one above.
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
  Node builtin. Enforced by dependency-cruiser, not by discipline. "The domain" means each module's
  `domain/` **and `@erp/platform` whole**: ADR-0033 puts domain-grade code in a package that has no
  `domain/` directory, and a rule scoped to the directory would hold the code that stayed while
  exempting the code that moved. A colocated `*.test.ts` is exempt — it is not shipped, and it
  imports the test runner — and that exemption is what lets the rule stay absolute everywhere else.
- One `index.ts` per package is the only public surface.
- Layers per module: `domain` → `application` → `infrastructure`. Dependencies point inward only.
- A port is introduced only at the **second real implementation**, never in anticipation of one.
  There is no email, storage or LLM port. **"Real" does not mean "in production"** (**ADR-0047**):
  a substitute a test must inject to prove something otherwise unprovable counts, and `Clock` is
  the precedent — it has one production implementation and exists so a fake one can be injected.
  The discriminator is whether the second implementation makes a test possible that could not
  otherwise be written; a mock that only records that it was called does not.
  **Not a port, and not held to this**: a structural narrowing of a third-party type, such as the
  `PgReadClient` slice of `pg`'s `query` declared once per tier instead of in every reader.
  This rule used to enumerate the ports that existed. It does not any more: the list was a second
  source of truth for something `grep` answers exactly, and it went stale within one phase.
- Time in the domain comes from the injected `Clock`. Building a `Date` at all is a lint error
  there — literal argument or not, and in `@erp/platform` as well as in each `domain/` — because
  the fake clock is what makes dated invariants deterministic. In a **test** the ban narrows to the
  wall clock, `new Date()` and `Date.now()`: a fake clock is built from a literal instant, while a
  test that reads the system clock passes today and fails on 29 February.
- No public setter: an object must not be able to exist in an invalid state.
- Never a bare `new Error()`. An error is **business** (expected, part of the contract) or
  **technical** (retryable).
- Every guard gets a **negative test** — a test that proves the rule _rejects_. A green gate that
  stopped looking is the one failure this repository exists to rule out, and it has happened here
  twice: the no-external-dependency rule could not see an npm import for a whole phase, and the
  kernel was exempt from both domain guards for the phase that filled it. The negative tests live
  in `tests/boundary-rule.test.ts` (dependency-cruiser) and `tests/lint-rules.test.ts` (ESLint),
  against fixtures under `__boundary-fixture__` that hold deliberate violations.

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

- Authorization lives in the **repository**, not in Postgres RLS (**ADR-0003**). It is never
  **decided** in a controller and never duplicated: one rule, one source. Since ADR-0023 there are
  three loci and they answer different questions — the route **declares** which roles carry the
  action, as data on the route and never as a comparison in a handler body; the repository decides
  which of the records that exist this actor may see; the domain decides whether an actor may act
  given who acted before them (**ADR-0006**). One decision each, and no handler compares a role
  **to authorize**. A handler may compare one to pick which shape of a role-discriminated
  response it returns, under **ADR-0093**'s two conditions: the route declares every role that
  reaches it, and every branch returns rather than refusing or narrowing a query.
- Three roles × `Office` scope. A manager reads their own office, never another's.
- Separation of duties, two rules only: whoever records a Cra does not validate it; whoever
  validates does not issue the invoice.
- `Cjm`, `Tjm` and margin never appear in a list view — only on the record. The asset being
  protected is the **aggregate**, so the control is on collection in volume, not on single access.
- Pagination is hard-capped, including through the API. There is no "show all".
- A refusal says **why**: RFC 9457 `problem+json` with the business field (violated invariant,
  missing scope, refusal reason). **A business refusal takes one of three statuses and never
  another** (**ADR-0042**): a value a domain rule refuses → 422, a state that refuses a fine value
  → 409, a caller who may not → 403 with the rule that denied it. **400 belongs to the transport**
  — a malformed body, a query the route cannot parse — and is decided before any module is called.
  This line used to read "validation → 400", which collapsed the two and is what ADR-0042 settled;
  the ADR wins and this file follows it, as the preamble requires. Empty, error and
  permission-denied states are deliverables, not polish.

## Stack — decided, do not substitute

Fastify · the two printable documents (`/facture/:id`, `/releve/:id`) server-rendered, with no
build step · the interactive UI a **React + TypeScript SPA** built by **Vite** in `apps/web` and
served by the same Fastify process, same origin, no CORS (ADR-0062, ADR-0063) — **TanStack** for
routing, data, tables and forms, **Tailwind + shadcn/ui** for the kit, **Playwright + axe-core**
for the end-to-end pass; `docs/frontend-plan.md` §1 is the authority on the exact list · `pg` with
hand-written SQL and numbered `.sql` migrations · Zod at the boundaries only · Vitest · pino ·
pnpm workspaces · a persona selector instead of authentication, announced as such.

**Not in this repository**, and the choice is written with its threshold: Redis, Kafka, RabbitMQ,
Elasticsearch, Terraform, Kubernetes, microservices, any ORM, any decimal library, any job queue,
Vue, PDF generation, OpenTelemetry, Testcontainers.

## Deployment

- The public mockup is one OCI image at `erp.clementvallois.fr`. Deployment controls are part of
  this repository now that the mockup is hosted (**ADR-0028**); sovereign or certified hosting for
  a target ERP is not claimed.
- Build and deploy are separate authorities. CI may build, attest and publish an image after a
  merge to `main`; it never connects to the host and holds no SSH key, VPS token, production
  database credential or runtime secret. GitHub's ephemeral, repository-scoped token may publish
  to GHCR. The host pulls by immutable digest (**ADR-0029**).
- Host isolation is a rule, not an operator convention: a dedicated unprivileged Unix user, narrow
  systemd permissions, an unpublished database network, a hardened non-root container, a dedicated
  nginx vhost and host-only secret files (**ADR-0030**).
- DNS, certificates, Unix users, sudoers and files under `/etc` are human-operated host changes.
  The repository documents and validates their reproducible inputs; CI never applies them.
- The public instance contains synthetic data only. Its lifecycle and reset policy are decided by
  ADR-0032 before host-side deployment is implemented.

## Working discipline

- **Do not add a dependency.** Propose one, with the evaluation grid (maintainers, activity,
  provenance, transitive weight, postinstall, licence) and a justification in the PR. The 7-day
  quarantine and `ignore-scripts` stay on.
- Scope changes go to the README's "Ce que je ne construis pas", never into the code.
- One structural decision = one ADR, written **at the time**, naming the rejected option and the
  reconsideration threshold. Numbering is never reassigned. **A changed decision gets a new ADR
  that supersedes the old one; a statement that was never true is corrected in place** — the test
  is whether the decision moved, and only a description of the code may be brought into line with
  the code (**ADR-0045**). The number, the date, the Status line, the rejected option and the
  threshold are never edited. This line was absolute — "an ADR is never rewritten" — until
  21/08/2026, when three ADRs turned out to describe code they had never described.
- One commit = one step defensible out loud. Conventional commits, scope from the closed enum in
  `commitlint.config.js`. **No `Co-Authored-By` trailer, ever**, however the code was produced.
- Everything in English except `README.md`. French business terms stay French only where
  translation loses contractual or legal meaning; `CONTEXT.md` is the authority, and a term is not
  used in code until it is in there.
- Comment only a non-obvious **mechanical** fact — a trap, a footgun, a setting that silently does
  nothing. Reasoning belongs in an ADR; link to it instead of restating it.
- TDD on the domain **and on infrastructure**, asymmetrically. A domain invariant gets a unit test
  with a fake `Clock` and no database; a repository or a migration gets an **integration test
  against a real Postgres, written before the SQL** (**ADR-0019**), isolated by a per-test
  transaction that is rolled back. This line used to read "on domain invariants only … not on
  infrastructure"; ADR-0019 superseded it in Phase 3, and the rule follows the ADR as the preamble
  of this file requires. What the history proves is narrowed on purpose: the test is written first,
  the commit carries both — see `docs/BUILD-PLAN.md`, § "What the history shows about test-first".
- Integration tests run in CI and on demand, never in `pre-push`: they need Docker. They are
  deliberately outside the coverage threshold, and their contract is the replacement — every
  repository method has a positive **and** a negative test, and every authorization scope rule has
  a test that asserts the refusal.
- The shared integration harness is a **workspace member**, `@erp/test-harness` (**ADR-0039**), not
  a directory reached by a relative path. `rootDir` is `src` in every package, and a climb out of it
  fails the per-package `tsc --noEmit` — which the `quality` CI job runs.
- Every foreign key is indexed in the migration that creates it. Migrations are additive and are
  replayed twice in CI. **One bounded exception exists** (**ADR-0057**, migration 010): a table that
  was created, never read and never held a row may be dropped, because leaving it would make the
  schema state a rule the domain does not. The exception is the ADR's, not a licence — a table
  holding data is migrated, never dropped.
- A worked day is a `date`; an event is a `timestamptz`. Never a bare `timestamp`.
- Ids are UUIDv7 generated in the application, so an aggregate can be built without touching the
  database. The legal invoice number is a **separate** field from the internal id.
- Display is French locale: decimal comma, `JJ/MM/AAAA`, ISO weeks from Monday, `Europe/Paris`.
- No secret in a log, an error response or a stack trace. Redaction happens in the serialiser, by
  allowlist — never at the call site.

## Claimed out loud, and not claimed

Claimed: **YAGNI** (the sorting criterion), the CI-enforced boundary — meaning the job **fails** **and** the merge button locks: the repository was made public on 03/09/2026, branch protection is enabled on `main` with every job required, and **ADR-0086** says so out loud (superseding ADR-0040, which had to say the gates were advisory while protection was unavailable) — exact monetary arithmetic,
authorization by role and scope, the CRA → line → invoice trail **as** the _piste d'audit fiable_.

Not claimed: **SOLID** (only two of five have teeth here, and they already have other names), DDD
and Clean Architecture as labels — the mechanisms are described, the words are not worn. If a
pattern name is used, it must be defensible down to the line of code that implements it.
