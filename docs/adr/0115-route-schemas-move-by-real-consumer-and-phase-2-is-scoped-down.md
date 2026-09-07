# ADR-0115 — Route schemas move by real consumer count; phase 2's file-size premise is stale

- **Date**: 2026-09-07
- **Status**: accepted

## Context

Package 14 of the audit (`docs/clean-up-audit.consolidated.local.md`): at the audit's original
revision, `registerApiRoutes` was "roughly a thousand lines within a 1,322-line file," mixing
request schemas, route registration, SQL-oriented orchestration, aggregate calculations, and
response presentation for every resource. The package named two ordered moves: first split routes
into resource modules (CRA, invoices/history, dashboard/org chart, pré-facturier, assignments, and
economics), keeping resource-specific schemas next to their routes and sharing only genuinely
common input schemas and HTTP helpers, with `blockingReasonsOf` named explicitly as misplaced
("belongs with pré-facturier, not with CRA merely because its input mentions a CRA"); second,
extract application queries/commands and response mappers so routes validate input, resolve the
actor, invoke a use case, and map the result — without inventing generic controllers, a repository
base class, a DI container, or a new service package merely to reduce file size.

Verified against the tree, not the tracker, before starting: commit `d536648` had already done a
first move of phase 1 (routes split by resource into `cra.ts`, `dashboard.ts`, `invoices.ts`,
`assignments.ts`, `pre-facturier.ts`), leaving three concrete gaps the audit's own six-resource
list did not fully anticipate:

- `blockingReasonsOf` still lived in `cra.ts`, its only caller being `pre-facturier.ts` — confirmed
  by grep, no other reference anywhere in `cra.ts` itself.
- `/api/v1/consultants/:consultantId/economics` was registered inside `pre-facturier.ts`'s own
  registrar, alongside two more endpoints the audit's six-resource list never named at all —
  `/api/v1/calendar` and `/api/v1/consultants` (the roster) — neither of which `pre-facturier.ts`'s
  own screen calls. Traced each to its real, single front-end caller: `/api/v1/calendar` only from
  `apps/web/src/lib/calendar.ts` (read by the CRA list's year filter); `/api/v1/consultants` only
  from `apps/web/src/features/cra/api.ts`; the economics endpoint only from
  `apps/web/src/features/marge/api.ts`. All three had been placed in `pre-facturier.ts`
  historically, not because that file had any claim on them.
- `routes/schemas.ts` still held every input schema from before the split — `Pagination`,
  `CraListParams`, `InvoiceListParams`, `MonthEntries`, `AssignmentBody`, `PreFacturierParams`,
  `ConsultantParams`, and the two HTTP-shaped helpers `notFound`/`assignmentRefusal` — regardless
  of how many resource files actually used each one.

## Decision

**Move every schema by its real consumer count, not by guessing.** For each exported symbol in
`schemas.ts`, grepped every route file for a real usage (an identifier reference, not a comment
mention — the session had already been burned once this package by a comment containing the
literal substring of another symbol's name) and counted distinct consuming files:

- **Exactly one consumer → moved next to that route file.** `CraListParams` (+ its private
  `CommaSeparatedIds`/`CommaSeparatedStatuses`/`MonthQuery` helpers), `PeriodParam`,
  `ConsultantPeriodParams`, `MonthEntries`, `RefusalBody` → `cra.ts`. `InvoiceListParams`,
  `BAD_REQUEST`, `IDEMPOTENCY_KEY_HEADER`, `IdempotencyKey` → `invoices.ts`. `AssignmentBody`,
  `assignmentRefusal` → `assignments.ts`. `PreFacturierParams` → `pre-facturier.ts`.
  `ConsultantParams` → the new `economics.ts` (below), its only consumer once the economics
  endpoint moved there.
- **Two or more consumers, or a constant two or more resource files reference directly → stayed in
  `schemas.ts`.** `Pagination`/`MAX_PAGE_SIZE`/`DEFAULT_PAGE_SIZE` (the base every list schema
  extends), `CRA_LIST_MAX_PAGE_SIZE` (`cra.ts`'s own cap, also read directly by `dashboard.ts`'s
  "CRA en retard" query), `PeriodQuery` (`dashboard.ts` and the new `economics.ts`), `YearQuery`
  (`cra.ts`'s `CraListParams` and `invoices.ts`'s `InvoiceListParams`, identical bounds), `IdParam`
  (`cra.ts`, `invoices.ts`, `assignments.ts`), `notFound` (all six resource files), `CONFLICT`
  (`invoices.ts` directly and `assignments.ts`'s own `assignmentRefusal`, once that moved).

**A new `economics.ts` registrar**, matching the audit's original six-resource list. It holds only
`GET /api/v1/consultants/:consultantId/economics` and the `ConsultantParams` schema that endpoint
alone uses.

**`/api/v1/calendar` and `/api/v1/consultants` (the roster) moved to `cra.ts`**, their real single
caller, rather than staying in `pre-facturier.ts` or joining the new `economics.ts` — neither
concerns economics, and both feed CRA screens exclusively today. `pre-facturier.ts` is left holding
exactly the one endpoint its name promises.

**`blockingReasonsOf` moved to `pre-facturier.ts`**, per the audit's own instruction, confirmed by
the same grep discipline: zero references inside `cra.ts` itself once its one caller left.

**Four now-genuinely-redundant identity-shaped `.map()`s were simplified in the same pass** —
`invoices: composition.invoices.map((row) => ({ ...row, status: row.status }))` and its three
siblings in `cra.ts`/`invoices.ts`/`pre-facturier.ts` had already become pure identity copies once
the companion fix (this branch's earlier commit narrowing `CraListItem.status`/
`InvoiceListItem.status`/`InvoiceYearStatusCount.status` to their real domain unions) deleted the
cast that used to justify the explicit field. Left as an accidental side effect it would have read
as unexplained churn in this diff; recorded here as an explicit, deliberate part of the same
tidy-up rather than a silent extra.

**Phase 2 ("separate transport from application work") is scoped down, not executed wholesale, and
the reason is written down rather than left to look like it ran out of runway.** The audit's stated
motivation for phase 2 was the same "roughly a thousand lines" file. That premise is now stale:
after the phase-1 moves above, every resource file is 53 to 505 lines (`economics.ts` 53,
`assignments.ts` 91, `pre-facturier.ts` 101, `invoices.ts` 328, `dashboard.ts` 351, `cra.ts` 505),
and the package's own "Done when" clause — "a reviewer can trace one endpoint to its policy/query
without opening unrelated resources" — is already true today: every endpoint sits in exactly the
one file for its own resource, most already delegating outright to an existing composition/domain
function (`craGridComposition`, `preFacturierComposition`, `recordMonth`, `validateCraAndDraftInvoices`,
`refuseCra`, `issueInvoice`, `assignmentCatalogue`/`createAssignment`/`updateAssignment`,
`consultantEconomics`, `managerStaffingSnapshot`). What remains genuinely mixed — transport
(parsing, actor resolution) and application logic (multi-step queries, aggregation, response
shaping) still inline in the same handler, with no composition function at all — is a specific,
named remainder, not the whole file: `cra.ts`'s `GET /api/v1/cras` (list) handler; `dashboard.ts`'s
`GET /api/v1/org-chart` and `GET /api/v1/dashboard` handlers (the largest, three role-specific
branches inline); `invoices.ts`'s `GET /api/v1/invoices` (the per-row source-Cra/consultant/mission
enrichment loop) and `GET /api/v1/invoices/:id` (the lineage/timeline construction). Extracting a
composition function for each of these is real, valuable work — and it is exactly the kind of
change the audit itself warns against doing "on momentum": each of the five needs its own
before/after behavioral proof (existing tests passing unchanged is necessary but, per the audit's
own words, this is "the first extraction," not license to skip verifying it), and bundling five
such extractions into the tail of an already-large package, with a stop instruction in hand, is the
shallow close the standing instruction explicitly warned against. Left as a precisely-named
remainder rather than attempted at reduced rigor.

## Rejected option

**Leaving every schema in `schemas.ts` regardless of consumer count**, on the grounds that moving
them is churn for its own sake. Rejected because the audit is explicit that resource-specific
schemas belong with their routes, and because the file's own history — every schema for every
resource accumulating in one file "temporarily" until the next reader adds a sixth copy of the
same pattern — is the exact failure `docs/open-questions.md`'s 07/09/2026 row (package 09's four
duplicated cast helpers) already named once this session.

**Doing phase 2 for all five remaining handlers now, at reduced depth, to close the package
completely.** Rejected for the reason stated above: the coordinator's own standing instruction
values a clean, honestly-scoped stop over a package that reads as finished but is not verified to
the same standard as everything before it in this session.

**Guessing schema placement from the audit's prose description rather than grepping real call
sites.** Rejected: the audit's own six-resource list, written before this branch existed, missed
`/api/v1/calendar` and `/api/v1/consultants` entirely — a description written once, in advance, is
not a substitute for checking the tree the moment before moving code that reads it.

## Reconsideration threshold

Reopen this ADR's phase-2 scoping the day any one of the five named handlers (`cra.ts`'s list,
`dashboard.ts`'s org-chart or dashboard reads, `invoices.ts`'s list or detail reads) needs a second,
independent caller for its query/aggregation logic — a second endpoint, a background job, a report
— since that is the concrete "policy/query reused, not just isolated" signal the audit's own
`chain/` precedent (`validate-cra.ts`, `issue-invoice.ts`, `record-month.ts`) was built for, not a
line count.

## Consequences

- `apps/api/src/routes/index.ts`'s registrar stays a six-line list of resource registrars, one per
  file, `economics.ts` now among them.
- A reader of any one resource file sees only that resource's own schemas and routes; `schemas.ts`
  holds six genuinely cross-resource symbols and nothing else.
- The remaining phase-2 work is precisely named rather than hidden inside a "done" claim: five
  handlers, named above, each a candidate for its own composition function whenever a second
  caller or a correctness bug makes the extraction pay for itself — tracked in
  `docs/clean-up-audit.consolidated.local.md`'s own package 14 row, not repeated here.
- No behavior changed: `pnpm run -s typecheck`, `lint`, `test` (680 unit), `test:int` (294) and
  `boundaries` all pass unchanged in shape (`boundaries`' own module count moved by exactly one,
  the new `economics.ts` file).
