# ADR-0113 — Mutations invalidate every projection they actually change, named by a table read off the server

- **Date**: 2026-09-07
- **Status**: accepted

## Context

Package 11 of the audit (`docs/clean-up-audit.consolidated.local.md`): "Complete mutation
invalidation and protect unsaved CRA drafts." Its evidence: CRA mutations invalidate selected
CRA/pré-facturier keys; issuance invalidates invoice list/detail only; assignment saves invalidate
assignments only. Dashboard, history, economics, and other affected projections can retain stale
answers within the 30-second freshness window. Its Work item asks for "a small mutation-to-
projection dependency table" before encoding any invalidation.

Reading the actual server compositions rather than guessing settled the table:

- `apps/api/src/routes/dashboard.ts`'s consultant branch reads `unit.cras.recentActivity`/
  `refusedPeriods`/`listPeriods`; its manager branch reads `unit.cras.awaitingDecision`/`count`
  (`pendingDecisions`, `lateCras`) and `unit.cras.recentActivity`, plus
  `managerStaffingSnapshot(unit.client, actor.officeId, today)` for `staffing`, plus
  `preFacturierComposition`'s `billable` for `billableCents`; its billing branch reads
  `unit.invoices.count`/`sumTtcCents`/`listPeriods`/`oldestDrafts`/`recentIssued`.
- `apps/api/src/routes/invoices.ts`'s `/invoices/history` reads `unit.invoices.countByYearAndStatus`
  (`byYearAndStatus`) and, for `denseMonths.billableCents`, the same `preFacturierComposition`
  the dashboard's manager branch uses.
- `apps/api/src/composition/pre-facturier.ts`'s `billable` is built from `unit.invoices.list`,
  the invoice aggregate for the period — **not** from the CRA rows directly. A CRA validation
  changes it only because validation drafts a new invoice; a CRA refusal does not, because
  refusal drafts none.
- `apps/api/src/staffing/staffing-snapshot.ts`'s `managerStaffingSnapshot` reads
  `public.assignments` directly.

| Mutation                                      | Already invalidated                   | Missed (this package)                     | Why (read off the server, not assumed)                                                                                                                             |
| --------------------------------------------- | ------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `useSaveMonth` (`cra/hooks.ts`)               | grid, CRA list                        | `['dashboard']`                           | a submit changes this CRA's status: consultant's `refusedPeriods`/`recentActivity`, or manager's `awaitingDecision`/`pendingDecisions`/`lateCras`/`recentActivity` |
| `useValidateCra` (`cra/hooks.ts`)             | pré-facturier, CRA list, manager grid | `['dashboard']`, `['facture-historique']` | drafts a new invoice: `billable` (manager dashboard **and** history's `denseMonths`, same composition) and `byYearAndStatus` (a new `draft` row) both move         |
| `useRefuseCra` (`cra/hooks.ts`)               | pré-facturier, CRA list, manager grid | `['dashboard']` only                      | drafts no invoice — `billable`/`byYearAndStatus` are untouched; only the manager's counts/activity change                                                          |
| `useIssueInvoice` (`factures/hooks.ts`)       | invoice list, invoice detail          | `['dashboard']`, `['facture-historique']` | flips status `draft` → `issued`: exactly what `byYearAndStatus` groups by, and what billing's own `draftInvoices`/`issuedInvoices`/`totalTtcIssuedCents` count     |
| `useSaveAssignment` (`affectations/hooks.ts`) | assignments catalogue                 | `['dashboard']` only                      | writes `public.assignments`, which `managerStaffingSnapshot` reads directly for the manager dashboard's `staffing` panel                                           |

Checked and deliberately **not** touched: `['marge', consultantId, period]` (`marge/hooks.ts`)
carries `staleTime: 0` already — every mount refetches regardless of any invalidation, so adding
one would be a no-op that changes nothing, confirmed by reading `useConsultantEconomics`'s own
options before adding anything. `['org-chart']` reads `manager_attachments`, which none of these
five mutations write.

## Decision

**Extract each mutation's invalidation list into its own exported function**
(`invalidateAfterSaveMonth`, `invalidateAfterValidateCra`, `invalidateAfterRefuseCra` in
`cra/hooks.ts`; `invalidateAfterIssueInvoice` in `factures/hooks.ts`; `invalidateAfterSaveAssignment`
in `affectations/hooks.ts`), each returning the `Promise<void>` its `useMutation`'s `onSuccess`
already awaited, so behavior is unchanged for the caller and each function is directly testable
(`hooks.test.ts` per feature) with a `QueryObserver` mounted on the projection in question — the
same technique `cross-tab-sync.test.ts` established in package 10, extended here to prove an
invalidation reaches a specific query rather than every query.

`['dashboard']` and `['facture-historique']` are added as **bare literal query keys** at each call
site, not an imported constant from `dashboard/hooks.ts` or `factures/hooks.ts`. TanStack Query
matches `invalidateQueries({ queryKey: ['dashboard'] })` against `['dashboard', period]` by value,
not by reference, so nothing requires importing the exact array `dashboardQueryOptions` builds.

## Rejected option

**A shared cross-feature helper module** (e.g. `lib/projections.ts` exporting
`invalidateDashboard`/`invalidateInvoiceHistory` for every feature to import). Rejected on the same
grounds package 09's `docs/open-questions.md` row (07/09/2026, naming package 14) already gives for
an analogous small duplication: `docs/open-questions.md`'s 24/08/2026 row tracks that this SPA has
no rule for cross-feature imports, and this package does not resolve that open question by adding
three new ones (`cra` → a hypothetical shared module, `factures` → the same, `affectations` → the
same) for a two-element array. The five extracted functions above already give each feature exactly
one place, local to itself, to read and test — a shared module would trade that locality for
avoiding a literal `['dashboard']` typed five times, which is not the more expensive failure mode.

**Branching `invalidateAfterSaveMonth` on `MonthEntriesRequest.submit`** (invalidate the dashboard
only when `submit: true`, since a plain save never changes CRA status). Rejected: the extra
request on a plain save is cheap (the dashboard's own `staleTime` and `refetchType: 'active'`
default mean it only fires for a screen actually open), and a conditional invalidation is one more
thing to keep in sync with `apps/api/src/routes/api.ts`'s own submit-vs-save logic if that ever
changes. Simplicity wins over a request that, on the save path, may occasionally do nothing.

## Reconsideration threshold

If `preFacturierComposition`'s `billable` definition ever starts reading CRA rows directly (not
only the invoice aggregate), re-check whether `useRefuseCra` needs `['facture-historique']` after
all — the reasoning above depends specifically on refusal never touching an invoice.

## Consequences

- Five new, small, directly-tested functions replace five inline `onSuccess` bodies — a pattern
  this branch now uses three times (`invalidateOnPersonaChange`, package 10; these five, package
  11), all following the same "extract so it is testable without a rendered tree" shape.
- A future mutation that changes CRA status, invoice status, or `public.assignments` has a
  concrete table to check against, rather than reasoning about the dashboard's composition from
  scratch.
- Two Work items from package 11's own text are addressed elsewhere in this same package rather
  than here: "make edits during an in-flight save either impossible or safely preserved" (the
  `canEdit` lock in `cra-grid-screen.tsx`, `68e9b5d`) and "preserve dirty state or present an
  explicit conflict" (`grid-resync.ts`, the same commit) — both landed before this ADR because
  ADR-0112's own blanket invalidation is what made them urgent. "Resolve refresh failures after a
  committed write clearly" is judged already adequate by the existing `ErrorState`/retry the grid
  shows on any failed refetch (reviewed, not rebuilt): a save that succeeded followed by a refetch
  that fails is visibly an error with a retry action, not a silent inconsistency, and this package
  does not add a second, save-specific error surface for the same outcome.
- **Amendment, same day, found by advisor review of the commit above (`c2e7bb9`):**
  `invalidateAfterSaveMonth` awaits its own invalidation before `useSaveMonth`'s `onSuccess`
  resolves, and `query-core` dispatches a mutation's `success` status only once `onSuccess`
  settles (`mutation.ts`) — so the grid's own invalidated query refetches, and `CraGridBody`
  re-renders with the new data, strictly _before_ `handleSubmitMonth`'s
  `await saveMonth.mutateAsync(...)` continuation runs and calls `setDirty(false)`. The version of
  `decideGridResync` this ADR originally described saw `dirty: true` for data the grid's own
  successful save had just produced, and held it as a conflict — confirmed empirically with a
  `QueryObserver` mounted on the grid's own query key, which saw the refetched data before
  `invalidateAfterSaveMonth`'s returned promise settled on every run. A consultant who
  successfully saved would have seen the conflict banner on their own save. Fixed by adding
  `savePending` (`saveMonth.isPending`) to `decideGridResync`'s input: a reference arriving while
  `dirty` is `true` and this grid's own save is still in flight is adopted, not held — safe
  specifically because `canEdit` already locks every edit path for that same window, so there is
  no newer edit left to protect. Fail-first, confirmed both ways.
