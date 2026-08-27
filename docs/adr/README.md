# Architecture decisions (ADR)

One ADR per structural arbitration, written **at the time** of the arbitration. Format:
`NNNN-title-in-kebab-case.md`, from `0000-template.md`.

Each ADR answers the three questions a reviewer will ask anyway: **which option was rejected**, **why
it loses in this precise context**, and **at what threshold we would change our mind**.

Two record-keeping rules, because the point of this log is that it was not retouched afterwards:

1. Numbering follows the order in which ADRs were written and is **never reassigned**.
2. An ADR is **not rewritten**. A decision that changes produces a **new** ADR that supersedes the
   previous one; the old one stays in place with its status updated.

   One exception, narrow on purpose: an ADR may be **corrected for a factual error, before the
   branch that introduced it merges to `main`**, and only where the decision, the rejected option
   and the threshold are untouched — a stated fact that was already false when it was written, not
   a position that has since become inconvenient. The correcting commit says what was wrong and
   why it is a correction rather than a change of mind, so the log still shows the edit rather than
   hiding it. Once an ADR is on `main` it is read by people who did not watch it being written, and
   this exception is closed: a wrong fact then gets a superseding ADR like anything else.

   Used once so far, on ADR-0014 — see the commit `docs(adr): cite commits by what they did`.

## Accepted

A superseded ADR keeps its row and its number, with `superseded` in the Status column and the
superseding number in its own Status line: numbering is never reassigned and the log is not
retouched, so what was decided stays visible next to what replaced it.

| No.                                                                                          | Decision                                                                           | Status     |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| [0001](./0001-sealed-modules-and-in-process-domain-event.md)                                 | Two sealed modules, one arrow, verified mechanically                               | accepted   |
| [0002](./0002-money-as-integer-cents.md)                                                     | Money is an integer number of cents, with no wrapper type                          | accepted   |
| [0003](./0003-authorization-at-the-repository.md)                                            | Authorization lives in the repository, not in Postgres RLS                         | accepted   |
| [0004](./0004-working-calendar-with-a-fixed-holiday-table.md)                                | The working calendar is a domain component with a fixed 2026 holiday table         | accepted   |
| [0005](./0005-cra-lifecycle-and-immutability.md)                                             | The Cra lifecycle, and where immutability binds                                    | accepted   |
| [0006](./0006-separation-of-duties.md)                                                       | Separation of duties: two rules, and where they are enforced                       | accepted   |
| [0008](./0008-fastify-not-nestjs.md)                                                         | Fastify, not NestJS                                                                | accepted   |
| [0009](./0009-server-rendered-html-no-client-framework.md)                                   | Server-rendered HTML, with no client framework                                     | superseded |
| [0010](./0010-vat-rounded-per-rate.md)                                                       | VAT is rounded per rate, and the rate is resolved from territoriality              | accepted   |
| [0011](./0011-hand-written-sql-no-orm.md)                                                    | Hand-written SQL over `pg`, and no ORM                                             | accepted   |
| [0012](./0012-half-day-as-the-storage-unit.md)                                               | The half-day is the single storage unit for recorded time                          | superseded |
| [0013](./0013-invoice-line-carries-its-origin.md)                                            | The invoice line carries its origin, though only `Regie` exists                    | accepted   |
| [0014](./0014-triage-leaves-the-public-history.md)                                           | The working triage leaves the public history                                       | accepted   |
| [0015](./0015-apps-tier-separate-from-packages.md)                                           | The application shell lives in `apps/`, a tier above `packages/`                   | accepted   |
| [0016](./0016-typed-errors-business-versus-technical.md)                                     | Typed errors: business versus technical, and how they reach the wire               | accepted   |
| [0017](./0017-legal-mentions-modelled-not-templated.md)                                      | Mandatory legal mentions are modelled on the document, not templated               | accepted   |
| [0018](./0018-one-series-for-invoices-and-credit-notes.md)                                   | One number series for invoices and credit notes, keyed (entity, fiscal year)       | accepted   |
| [0031](./0031-reference-data-per-module-projections.md)                                      | Reference data: per-module projections, the seed as single writer                  | accepted   |
| [0033](./0033-shared-kernel-holds-the-transported-vocabulary.md)                             | The shared kernel holds the vocabulary the boundary transports                     | accepted   |
| [0034](./0034-dated-references-resolved-at-the-close-of-the-period.md)                       | One dated-reference mechanism, resolved at the close of the period                 | accepted   |
| [0035](./0035-exact-money-arithmetic-half-up-and-basis-points.md)                            | Exact money arithmetic: half-up on integers, rates in basis points                 | accepted   |
| [0036](./0036-a-credit-note-carries-positive-amounts.md)                                     | A credit note carries positive amounts; the document type carries the direction    | accepted   |
| [0037](./0037-only-regie-days-become-invoice-lines.md)                                       | Only Regie days become lines, and the days that do not are reported                | accepted   |
| [0038](./0038-one-invoice-per-client.md)                                                     | One validated Cra drafts one invoice per client, so drafting returns a set         | accepted   |
| [0019](./0019-tdd-extended-to-persistence.md)                                                | Integration tests before SQL, real Postgres, per-test transaction rollback         | accepted   |
| [0007](./0007-gapless-invoice-numbering.md)                                                  | Gapless numbering: a counter row locked with `SELECT … FOR UPDATE`                 | accepted   |
| [0020](./0020-domain-events-as-persisted-audit-journal.md)                                   | Domain events are persisted in the emitting transaction, as the audit journal      | accepted   |
| [0021](./0021-idempotent-cra-processing.md)                                                  | Processing the same Cra twice drafts nothing new                                   | accepted   |
| [0039](./0039-the-integration-harness-is-a-workspace-member.md)                              | The integration harness is a workspace member, not a directory                     | accepted   |
| [0040](./0040-ci-gates-are-advisory-while-the-repository-is-private.md)                      | The CI gates are advisory while the repository is private on the free plan         | accepted   |
| [0022](./0022-deterministic-seed-is-a-deliverable.md)                                        | The seed is a deliverable, not a fixture: deterministic, Zod-validated             | accepted   |
| [0041](./0041-deterministic-uuidv7-for-all-identifiers.md)                                   | Deterministic UUIDv7 for all identifiers, including child rows                     | accepted   |
| [0024](./0024-structured-logging-redacted-by-allowlist.md)                                   | Structured logging, redacted by allowlist in the serialiser                        | accepted   |
| [0025](./0025-html-rendered-without-a-template-engine.md)                                    | HTML from a tag that refuses the holes it cannot escape, and no engine             | accepted   |
| [0026](./0026-one-screen-language-with-centralised-labels.md)                                | One screen language, French, with every visible string in one file                 | accepted   |
| [0042](./0042-which-status-a-business-refusal-takes.md)                                      | Which HTTP status a business refusal takes, and what it may publish                | accepted   |
| [0023](./0023-persona-selector-instead-of-authentication.md)                                 | A persona selector instead of authentication, and where authorization is decided   | accepted   |
| [0043](./0043-economics-is-read-at-the-composition-root.md)                                  | Margin is read at the composition root, because it belongs to neither module       | accepted   |
| [0044](./0044-idempotency-key-is-stored-not-merely-required.md)                              | `Idempotency-Key` is stored, not merely required                                   | accepted   |
| [0045](./0045-a-false-statement-in-an-adr-is-corrected-in-place.md)                          | A false statement in an ADR is corrected in place; a changed decision supersedes   | accepted   |
| [0046](./0046-intercontrat-is-modelled-as-an-internal-non-billable-mission.md)               | `Intercontrat` is modelled as an internal non-billable mission                     | accepted   |
| [0047](./0047-what-counts-as-a-second-implementation.md)                                     | What counts as a second implementation, and what is not a port at all              | accepted   |
| [0048](./0048-the-screens-ship-in-the-api-deployable.md)                                     | The screens ship inside the API deployable; `apps/api` keeps its name              | superseded |
| [0049](./0049-the-application-declares-its-own-content-security-policy.md)                   | The application declares its own CSP, and it says there is no script               | superseded |
| [0050](./0050-the-grid-posts-the-whole-month.md)                                             | The entry grid posts the whole month, in half-day slots, totals server-side        | accepted   |
| [0051](./0051-an-habilitation-constrains-a-day-at-submission.md)                             | An `Habilitation` constrains a recorded day, checked at submission                 | accepted   |
| [0052](./0052-the-margin-reveal-is-a-screen-and-the-disclosure-log-moves-inside-the-read.md) | The margin reveal is a screen of its own, and the disclosure log moves inside it   | accepted   |
| [0053](./0053-the-pre-facturier-is-a-composition-not-a-query.md)                             | The pré-facturier is a composition, not a query across the boundary                | accepted   |
| [0054](./0054-a-late-day-is-a-recorded-half-day-a-closed-month-has-not-validated.md)         | A late day is a recorded half-day a closed month has not validated                 | accepted   |
| [0055](./0055-the-invoice-is-a-printable-html-page-and-not-a-pdf.md)                         | The invoice is a printable HTML page, and there is no PDF engine                   | accepted   |
| [0056](./0056-the-printable-cra-is-one-document-for-the-month.md)                            | The printable `Cra` is one document for the month, whatever it spans               | accepted   |
| [0057](./0057-a-credit-note-is-a-domain-rule-here-and-not-a-stored-document.md)              | A `CreditNote` is a domain rule here, and not a stored document                    | accepted   |
| [0058](./0058-child-row-identity-is-not-made-stable.md)                                      | Child-row identity is not made stable, and the threshold is named                  | accepted   |
| [0059](./0059-a-screen-carries-its-idempotency-key-in-a-hidden-field.md)                     | A screen carries its `Idempotency-Key` in a hidden field                           | accepted   |
| [0060](./0060-the-screens-name-a-refusal-in-french-keyed-by-its-type.md)                     | The screens name a refusal in French, keyed by its `type`                          | accepted   |
| [0061](./0061-accessibility-is-held-mechanically-and-not-audited.md)                         | Accessibility is held mechanically; it is not an RGAA conformance claim            | accepted   |
| [0062](./0062-react-spa-for-the-interactive-screens.md)                                      | A React SPA for the interactive screens                                            | accepted   |
| [0063](./0063-the-spa-ships-in-the-api-deployable.md)                                        | The SPA ships in the API deployable, as build output, same-origin stays forced     | accepted   |
| [0064](./0064-the-content-security-policy-admits-a-script.md)                                | The Content-Security-Policy admits a script, scoped to `'self'`                    | superseded |
| [0065](./0065-composition-root-reads-get-a-directory.md)                                     | Composition-root reads get a directory, and economics stays where it is            | accepted   |
| [0066](./0066-the-grid-mirrors-the-slot-fill-rule-client-side.md)                            | The grid mirrors the slot-fill rule client-side, and never persists a slot index   | superseded |
| [0067](./0067-the-grid-write-is-refetch-driven-not-optimistic.md)                            | The grid write is refetch-driven, not optimistic                                   | accepted   |
| [0068](./0068-the-grid-slot-control-is-a-native-select.md)                                   | The grid's slot control is a native `<select>`, not shadcn's `Select`              | superseded |
| [0069](./0069-the-quarter-day-is-the-storage-unit.md)                                        | The quarter-day replaces the half-day as the single storage unit                   | accepted   |
| [0070](./0070-the-entry-grid-is-a-mission-by-day-matrix.md)                                  | The entry grid is a mission × day matrix, and one cell is one `CraLine`            | accepted   |
| [0071](./0071-a-manager-reads-a-named-consultants-grid-through-a-new-scoped-route.md)        | A manager reads a named consultant's grid through a new, scoped route              | accepted   |
| [0072](./0072-style-src-admits-inline-because-the-kit-writes-style-attributes.md)            | `style-src` admits `'unsafe-inline'`, because the UI kit writes `style` attributes | accepted   |
| [0073](./0073-the-dashboard-reads-an-optional-period-override.md)                            | The dashboard reads an optional `?period=` override, defaulting to the wall clock  | accepted   |

0008–0011 were written on 17/08 out of numeric order relative to 0005–0007. Those three numbers were
**reserved** earlier the same day, and a reservation is honoured rather than reshuffled — renumbering
to close the gap is exactly the retouching that rule 1 above forbids. The gap is the record: it shows
which decisions were known before they were made.

0014 onwards were reserved the same day by `docs/BUILD-PLAN.md`, which assigns each remaining number
to the phase that consumes it. A number there is a commitment that the decision will be written when
it is taken, not a placeholder to be shuffled.

0033 and 0034 are the first numbers **not** reserved by that table: the plan's last reserved number is 0032, and
Phase 1 hit two structural questions the plan had not identified — where a value object both
modules speak lives, given that the cruiser forbids the import that would otherwise settle it
(0033), and how a dated reference resolves for a whole month rather than a day (0034). Both were
written when they were taken, numbered after the reservations, and recorded in the Phase 1
checkpoint.

0035 onwards continue that sequence, for decisions Phase 2 reached that the plan had not identified,
and 0039 and 0040 for the two Phase 3 reached on its way out. 0039: where the shared integration
harness lives, forced by a per-package type error the phase had recorded as an open question on a
false premise. 0040: that the CI gates are advisory, forced by opening the repository's first pull
request and finding that the branch protection the README had claimed since Phase 0 was never
available on this plan.

The plan's reservations for 0019–0032 are untouched: a number it assigned to a phase stays assigned
to that phase, and a decision taken early takes the next free number instead of borrowing one.

0022 takes the number the plan reserved for the seed decision. 0041 continues the unplanned sequence
for a decision Phase 4 reached that the plan had not identified: how child-row identifiers are
generated (UUIDv7 everywhere, deterministic in the seed — the positional string alternative the open
questions had carried was retired).

0024 takes the number the plan reserved for structured logging. 0042 continues the unplanned
sequence, for a decision Phase 5 reached that the plan had not identified: ADR-0016 deliberately
fixed only **where** a `problemType` becomes an HTTP status, and applying it to twenty-six refusals
turned out to need two rulings nothing had made — that a domain refusal never answers 400 (422 and
409 split what "validation" was one word for), and that a 403 publishes the rule that denied it and
none of the business fields that would describe what it is hiding.

0043 and 0044 continue it, for two more the plan had not identified and that writing the routes
forced. 0043: margin needs `Tjm` from one module and `Cjm` from neither, so the read has no module
to live in — and improvising the join inside a route handler is what the ADR discipline exists to
stop. 0044: ADR-0021 promised "replay → original result" through a port that could only answer a
boolean, and BUILD-PLAN required an `Idempotency-Key` that nothing stored; a required header that
changes no behaviour is a gate that is present and inert.

0045 continues the unplanned sequence, and is the only one so far about the record rather than the
code: three ADRs were found to contain statements that were never true, and the absolute
"an ADR is never rewritten" rule would have answered a typo with a superseding note. The test is
now whether the **decision** moved — if it did, supersede; if only its description was wrong, fix
the sentence, because these files are decisions and not logs.

0046 is a promotion rather than a new decision: intercontrat as an internal non-billable mission
was settled on 18/08/2026 and recorded as a row in `docs/open-questions.md`, which was the wrong
place for something that shapes the completeness rule and interacts with ADR-0037. It gains the
reconsideration threshold `CLAUDE.md` requires, and `CONTEXT.md` stops contradicting it.

0047 settles a rule that had gone quietly unapplied: Phase 5 added four ports to a BUILD-RULES line
that enumerated three, and no ADR said whether four exceptions had been taken or the rule had
lapsed. Neither, as it turned out — three of the four meet the criterion once "real implementation"
is read the way `Clock` has always been read, and the fourth is not a port. The enumeration is what
goes.

0048 opens Phase 6 by answering a question the branch name had quietly begged. `feat/web` and the
`web` commit scope both read as an `apps/web` about to be created, and no decision had ever said
so; the dependency whitelist, `@erp/api`'s three-export public surface and Phase 8's single
Dockerfile all say the opposite. It also does something the other ADRs here do not, and says so:
it accepts a name that is wrong. `apps/api` serves HTML from this phase onward, and the cost of
renaming it across eleven files mid-phase is higher than the cost of a directory whose inaccuracy
is written at the top of the log that names it.

0049 is the second unplanned number of Phase 6 and comes from a gap rather than a question: 8.3
schedules security headers on the nginx vhost, which leaves the screens with no policy at all in
development, in the tests, and in CI — for two whole phases. It is also the only place where two
existing decisions become checkable from outside the repository: `default-src 'none'` is ADR-0009's
"no client framework" and ADR-0025's refusal to interpolate into a `<script>` body, restated in a
form a browser enforces.

0050 and 0051 are Phase 6's task-level decisions, and both come from rows the open-questions file
had been holding for the phase that would need them. 0050 answers the question the 19/08 row
explicitly refused to guess — what the grid posts — and, in the same breath, records a **narrowing
of BUILD-PLAN's own wording**: "live totals" becomes "current as of the last save", because
ADR-0049 forbids script and ADR-0009's threshold names this exact grid as the case that would
reopen the no-framework decision. One grid is not ten screens, and a threshold spent on the
cheapest interactivity is a threshold that was never a threshold. 0051 gives three seeded-but-unread
tables a reader, and says out loud that its refusal is demonstrated in a unit test rather than in
the demo — because a dataset that violated the rule would not seed, and one that complies never
shows the rule work.

0052 to 0061 are the rest of Phase 6, and they divide in two. **0053 and 0057 are structural**:
0053 is the one the boundary forced — the pré-facturier needs a month's declined days, the obvious
SQL joins `timesheet.cras` from inside `billing`, and the answer is that the composition root hands
`billing` a set of Cra ids rather than letting the module reach for them; 0057 removes a table the
schema had that the domain did not, and argues its bounded exception to the additive-migration rule
rather than waving past it. **The other eight are the decisions a screen forces once it exists**:
what a late day is (0054), where the margin is revealed and where its disclosure log lives (0052),
that a printable document is HTML and not a PDF engine (0055, 0056), how a form carries a header it
cannot set (0059), what language a refusal speaks and what it may not borrow from the API (0060),
and what "accessible" is allowed to claim without an audit behind it (0061). 0058 is the odd one:
it decides **not** to change code, because 0057 removed the cause, and names the three thresholds
that reopen it — a deferral that says so is a row in the open-questions file, and this is not one.

0062 to 0064 open Phase 0 of `docs/frontend-plan.md`, and none of the three is a new decision in
the sense the rest of this log is — each is a reopening that three earlier ADRs wrote their own
threshold for. 0009 named the exact screen that would reopen it (a Cra grid with client-side
entry) and even named its own remedy (Vue); 0048 answered a question the branch name `feat/web`
had begged since before there was code to check it against; 0049 rejected `script-src 'self'` by
name, on the explicit condition that it would be reopened "in the same commit as the script." All
three conditions are met at once, by one plan, which is why all three ADRs are dated the same day
and all three supersede rather than add: nothing here identifies a decision the plan had not
already named, the way 0033 onward did. What Phase 0 forced was writing them down before the code
that meets each threshold exists, because this repository's ADR discipline runs ahead of the
diff, not behind it.

0066 to 0068 are the three decisions Phase 6 — the grid, ADR-0062's own named trigger — actually
forced once it was built rather than reopened. 0066 and 0067 answer the two halves of one
question the plan named in advance ("comment le grid écrit"): what the two boxes per day mean when
the wire carries no slot at all, and what happens between clicking Enregistrer and the screen
believing it. 0068 is the odd one of the three: it is not required by the plan's own stack table,
which names shadcn/ui without qualification, and it exists because 62 simultaneous instances of
one Radix primitive is a scale nothing built before this phase had tried.

0069 and 0070 are one arbitration in two files, and the pair is the clearest thing this log has to
show about why it exists. ADR-0012 wrote, on 18/08, the sentence "reopen if quarter-days appear in
real usage" — a threshold nobody was going to be held to. On 26/08 they appeared, in the tool the
firm actually uses, and 0069 honours it: the unit changes, and the two per-day invariants written
against a named constant rather than a literal `2` move with it for free, which is the payoff of a
convention that looked like pedantry when it was adopted. 0070 is the consequence rather than a
second decision — a day that holds four things is not a day-per-row grid any more — and it takes
0066 and 0068 with it, because both were answers to a question (what do two boxes per day mean)
that the new shape does not ask.

0071 and 0072 continue Phase 9's own sequence, unnarrated here until now: 0071 is Phase 6's grid
reopened by a role rather than by data — a manager reading a named consultant's month needed its
own scoped route rather than the consultant's own `/cra/:period`, because the two answer different
authorization questions. 0072 is ADR-0064 reopened by the one topology that had never run it:
Vite's dev server sends no CSP at all, so `style-src 'self'` stood untested for two whole phases
against a UI kit that writes `style` attributes at render time.

0073 is Phase 10's, and it is the same shape as 0050's "narrowing of BUILD-PLAN's own wording"
further up this log: a decision Phase 8 had already made — the dashboard reads the wall clock,
with no picker — turned out wrong once the seed's frozen `2026-06` (ADR-0022) met a calendar that
keeps moving, and task 10.4's demo checklist forced the question rather than leaving it latent. The
override changes nothing a visitor can see; it exists for the one caller (`journeys.spec.ts`) that
needs a period a re-run of the suite does not depend on the day it happens to run.

## Identified, not yet decided

Numbers are reserved so that what is **known and unsettled** is visible rather than implied.

**Empty since 19/08/2026.** 0007 was the only entry and Phase 3 wrote it. The reservations that
remain live in `docs/BUILD-PLAN.md`, which assigns each number to the phase that consumes it; this
table returns when a decision is identified that the plan did not.
