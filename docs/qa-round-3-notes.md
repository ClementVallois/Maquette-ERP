# QA round 3 — implementation notes

Short notes on anything that needed a judgment call, for Clement to convert into proper ADRs where
warranted. Not exhaustive documentation — see the commit messages for the rest.

## Item 27 — kept the trailing period

The item's target string was given as `'Une journée ne peut pas dépasser le volume horaire
prévu'` (no trailing period). Every other entry in `problem.sentences` (both label files) ends
with a period, including its immediate neighbours. Shipped with the period, on the assumption the
period was dropped incidentally when the item was written down, not a deliberate instruction to
break the file's own punctuation convention. Flagging in case that reading is wrong.

## Item 22 — a new `beforePeriod` read-side filter, no existing mechanism covered it

The "CRA en attente de décision" card maps cleanly onto the existing filters (`statuses=submitted`,
`year`/`month` omitted). "CRA en retard" does not: `lateCras` (`apps/api/src/routes/api.ts`) is
`status !== 'validated' AND lastDayOf(period) < today`, and `/api/v1/cras`'s `CraListQuery` had no
way to express a period range — only one exact year, one exact month, or an exact `period`. Rather
than approximate it client-side (which would desync the count and the list the moment pagination
or an edge-of-month case bit), added `beforePeriod` end to end: `CraListQuery.beforePeriod`
(`packages/timesheet`), `c.period < $N` in `PgCraRepository.list`/`.count`, `CraListParams` on
`GET /api/v1/cras`, and `cra.index.tsx`'s search schema. It is a read-side query capability in the
same shape as the existing `year`/`month` filters (item 4, QA round 2 set that precedent), not a
new domain invariant, so no ADR seemed warranted — flagging here in case Clement disagrees and
wants one written for the query surface itself. `beforePeriod` on the dashboard link is computed
from the browser's own clock (`currentPeriod()`, already used by the "months ahead" picker) rather
than a server round-trip — the equivalence to the server's own `today`-based `lateCras` is proved
in `CraListQuery`'s own doc comment. **Not verified against a live Postgres** (no DB in this
sandbox) — `pg-cra-repository.int.test.ts` already exercises `year`/`month` narrowing and none of
its existing calls pass `beforePeriod`, so nothing there should break, but the new clause itself
has no test of its own yet.

## Item 18 — new `GET /api/v1/team`, no existing endpoint covered it

Checked first, per the brief: `GET /api/v1/consultants` (ADR-0077) gives an office roster, not who
reports to whom. `PgReferenceReader.hierarchy()` already existed but was write-side only
(`refuse-cra.ts`/`validate-cra.ts`, deciding who accepts a Cra) — no route exposed it. Added
`GET /api/v1/team`, `forRoles('consultant', 'manager')`, reusing `hierarchy()` (for "who manages
me today") and `consultantsOfOffice()` (for a manager's direct reports, inverting the hierarchy
against that office's current non-departed roster) rather than new SQL. Both consultant (N+1) and
manager (N+1 + N-1) sides are implemented and committed together — the brief's "implement the
smaller side and note the rest" escape hatch was not needed. Billing has no place in this org
chart in the seed data (the one billing persona, Henri, is the *director* every manager reports
to) so the panel does not render for that role, matching the item's own two described cases.

## Item 28 — the pré-facturier's own "Valider" dialog does not get the warning

`ValidateConfirmDialog` (`validate-confirm-dialog.tsx`) has two callers: `manager-cra-grid-
screen.tsx` (the CRA detail view, item 21's now-primary path via "Vérifier") and `pre-facturier-
screen.tsx` (the pré-facturier table's own row-level "Valider" button, unchanged this round).
Implemented the new `flaggedDaysCount` warning banner for the first — `data.flags` is already on
that screen's payload, zero backend cost. The second has no such data: `PreFacturierCraRow`
(`apps/api/src/composition/pre-facturier.ts`) never calls `runSubmissionChecks`/computes `CraFlag`
per row — it is a lightweight list summary by design, and adding this would mean loading every
listed CRA's lines and calendar just to answer a warning, a real cost on a page that can be large
and paginated. Left that path without the warning rather than fake the count or make every
pré-facturier page load heavier without Clement deciding that trade-off. Flagging for an ADR if he
wants it added properly (compute it once, cache it, or accept the per-row cost).

## Item 17 — `?url` did not stop Vite inlining the illustrations; assetsInlineLimit does

The three company-news illustrations (`src/assets/news-*.svg`, ~1KB each) are well under Vite's
default 4KB inline threshold. A plain `import` inlines them as a `data:` URI in the built JS,
which the production CSP's `img-src 'self'` refuses. The documented fix — an explicit `?url`
import suffix, which is supposed to force a real emitted file regardless of size — did **not**
work here: verified against the actual `dist/` output (not assumed), all three still ended up
base64/URL-encoded inside `tableau-de-bord-*.js`. What did work: `vite.config.ts`'s
`build.assetsInlineLimit` as a function, returning `false` for any path matching `news-*.svg` and
`undefined` (default behaviour) for everything else — confirmed by rebuilding and finding three
real, content-hashed `.svg` files under `dist/assets/`. Left the `?url` mystery unexplained
(possibly an interaction between the `@` alias and query-suffixed specifiers in this Vite
version) — worth a look if it recurs elsewhere, but the size-based override is scoped tightly
enough (one regex, one file-name pattern) that it does not need to be understood to be trusted.

## Item 25 — could not reproduce the alphabetical sort, fixed it defensively anyway

Searched every period-bearing Select/column in `apps/web` (the CRA table's year/month filters,
the pré-facturier's `PeriodSelector`, the invoice list's own `period` column) — everywhere else a
period list is either built server-side already sorted on the raw `YYYY-MM` key (descending,
`offeredPeriods` in `apps/api/src/composition/pre-facturier.ts`) or is a fixed 1-12 month-number
list. The one column matching the item's exact wording ("Période d'exécution" is `LABELS.invoice
.supplyPeriod`, the `/factures` table's `period` column header) already sorted by `row.supplyPeriod`
(the raw key) via TanStack's default `accessorFn`-based sort, which should already be chronological
by construction. Could not reproduce a live alphabetical-sort bug from reading the code alone (no
browser available in this pass). Made the column's `sortingFn` explicit anyway — a direct
`localeCompare` on the raw key — so the sort no longer depends on TanStack's `auto` column-type
detection, which is the only mechanism that could plausibly have produced the reported symptom.
Worth a five-minute look in a real browser before calling this closed.

## Item 31 — the timeline is a third display site

The brief named the CRA banner (consultant + manager read). `apps/web/src/features/cra/components/cra-timeline.tsx`
repeats the same manager reason as the business timeline's "CRA refusé" entry `detail`. Confirmed
in `apps/api/src/routes/api.ts`'s `craTimeline` builder that `detail` is only ever populated for
the `refused` timeline kind (never for `submitted`/`validated`), so prefixing it there
unconditionally is safe and was added in a follow-up commit.
