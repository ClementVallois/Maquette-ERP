# Front-end plan — UI/UX rebuild of the ERP, connected to the real API

> This document replaces `docs/pre-frontend-plan.md`, which was written without access to the
> code. It is a working document for Clement and the executing agent.

## 0. Context and objective

The current web version (Phase 6, `apps/api/src/web/`) is functional and rigorous, but deliberately
austere: server-rendered HTML, no client-side JavaScript, two navigation links and no dashboard.
This plan rebuilds the **interactive** UI with a modern stack and a product-grade finish suitable
for a CEO demonstration.

Three premises distinguish this plan from its predecessor:

1. **The backend exists, runs, and is authoritative.** The SPA consumes the real `/api/v1/*` API
   with the existing persona cookie and deterministic seed (`2026-06`, four personas, existing demo
   scenarios). **No MSW and no faker**: the seed supplies demo data and Appendix A pins the API
   contracts.
2. **The two printable documents remain server-rendered.** `GET /facture/:id` and
   `GET /releve/:id` are finished, tested and carry print CSS. The SPA opens them in a new tab. The
   other server-rendered screens are removed in Phase 9 after the SPA reaches parity.
3. **The plan contains two non-front-end phases**: a short ADR task (Phase 0) and a short backend
   phase for three missing reads (Phase 5), written test-first.

There is no CORS and there will be none. The `Origin` control refuses writes from an origin other
than `API_PUBLIC_ORIGIN`, and the cookie is `SameSite=Strict`. The SPA is therefore same-origin:
Fastify serves it in production and Vite proxies to Fastify in development (Phase 0.3).

The agent executes this plan autonomously, phase by phase. Each phase has tasks and a verifiable
exit gate; the next phase does not start until that gate passes.

## 0bis. Rules for the executing agent

1. Work phase by phase, in order. Tasks within a phase may be reordered only when a dependency
   requires it.
2. Never declare a phase complete before verifying its gate.
3. Use conventional commits, one defensible step per commit, with a scope from the closed enum in
   `commitlint.config.js`. Never add a `Co-Authored-By` trailer.
4. Justify every dependency in one line and pin a version at least seven days old. Verify with
   `pnpm view <pkg> time`.
5. Keep `pnpm run check` green at every commit. The pre-push hook runs `typecheck`, `boundaries` and
   `test:cov`.
6. Apply the repository's strict TypeScript rules to `apps/web`: `strict`,
   `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, no `any`, and
   `no-console: error`.
7. Work test-first in backend Phases 5 and 9. Each endpoint gets a real-Postgres integration test
   before its route, in the same commit (ADR-0019).
8. Do not guess contracts. Read `apps/api/src/routes/` or call the seeded endpoint. Never write a
   `HYPOTHESIS` comment.
9. Never use Playwright `waitForTimeout`; wait for an observable state.
10. Capture significant visual tasks under `tests/visual/review/<phase>-<task>.png` for human
    review.
11. Do not expand scope. Put ideas outside the CRA-to-invoice chain in the README's “What I am not
    building” section.

## 1. Selected technical stack

These choices were made by Clement on 24/08/2026 and are not reopened without a proven blocker.

| Area      | Choice                                         | Short justification                                               |
| --------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| Framework | **React + strict TypeScript**                  | shadcn/ui and TanStack Router/Table/Form are React-first.         |
| Build     | **Vite**                                       | Fast HMR; `apps/web` is the only front-end build.                 |
| Routing   | **TanStack Router**, file-based, named exports | Typed routes while keeping `import-x/no-default-export`.          |
| Data      | **TanStack Query**                             | Cache, invalidation and retry against the real API.               |
| Tables    | **TanStack Table**                             | Headless and fully custom; no virtualization for one capped page. |
| Forms     | **TanStack Form + zod v4**                     | Reuse the repository's zod 4.4.3.                                 |
| UI kit    | **shadcn/ui**                                  | Copied, customizable components.                                  |
| Styling   | **Tailwind CSS**                               | Token-based styling with almost no custom CSS.                    |
| Icons     | **lucide-react**                               | Supplied by shadcn/ui.                                            |
| Motion    | **CSS transitions + Tailwind tokens**          | No Framer Motion dependency.                                      |
| UI tests  | **Playwright + @axe-core/playwright**          | End-to-end against the real stack and Postgres seed.              |
| Packages  | **pnpm**                                       | `apps/web` becomes a workspace member.                            |

MSW, faker, Framer Motion and TanStack Virtual are deliberately excluded.

## 2. Cross-phase architecture principles

- **`apps/web` speaks to the backend only over HTTP.** Dependency-cruiser forbids importing
  `apps/api`. It may import `ProblemDetails` and `API_PROBLEM_TYPES` from the public
  `@erp/contracts` index.
- Errors are RFC 9457 `application/problem+json`. Branch on `type`, never `status`. Render the
  applicable `detail`, `invariant`, `deniedBy`, field `errors` and `correlationId`.
- One `src/lib/labels.ts` module holds visible French copy with English keys and `as const`. It is a
  deliberate copy of `apps/api/src/web/labels.ts`, not a shared package. No component hardcodes a
  visible string.
- The UI is French. Keep the domain terms from `CONTEXT.md`: `Cra`, `Regie`, `Tjm`, `Cjm`,
  `Intercontrat`, `Habilitation`, `Passi` and `Pré-facturier`. The persona selector is not login.
- Money is integer cents, VAT rates are integer basis points, and quantities are integer
  quarter-days. Display French decimal commas, `DD/MM/YYYY`, Monday-first ISO weeks and
  `Europe/Paris`. `src/lib/format.ts` mirrors the API formatter.
- `Cjm`, `Tjm` and margin never appear in a list or dashboard. Margin lives on a dedicated screen
  reached by an explicit action; the server logs every disclosure (ADR-0052).
- Navigation is typed configuration filtered by role, never ad-hoc JSX in the Sidebar.
- Every feature follows `api.ts`, `hooks.ts`, `types.ts`, `components/`. Components call hooks,
  never `fetch` or feature `api.ts` directly.
- Empty, error and denied states are deliverables. Every phase names the persona that demonstrates
  them.
- The offered actions follow the active role. A direct URL that bypasses the offer renders a
  designed 403 page naming `deniedBy`.

## 3. Target tree and routes

```text
apps/web/
  package.json  tsconfig.json  vite.config.ts  index.html  playwright.config.ts
  e2e/                 # journeys.spec.ts, axe.spec.ts, outside boundary source globs
  src/
    main.tsx  router.ts  routeTree.gen.ts
    routes/
      __root.tsx  index.tsx  _shell.tsx  dev.composants.tsx
      _shell/
        tableau-de-bord.tsx
        cra.index.tsx  cra.$period.tsx
        pre-facturier.tsx
        factures.index.tsx  factures.$id.tsx
        marge.$consultantId.tsx
    components/
      ui/  shell/  feedback/  data-table/
      status-badge.tsx  stat-card.tsx
    features/
      session/  cra/  pre-facturier/  factures/  marge/  dashboard/
    lib/
      api-client.ts  problems.ts  labels.ts  format.ts  query-client.ts  utils.ts
    config/navigation.ts
    styles/globals.css
```

Pinned SPA routes: `/`, `/tableau-de-bord`, `/cra`, `/cra/$period`, `/pre-facturier`,
`/factures`, `/factures/$id`, `/marge/$consultantId`. The plural SPA `/factures` must never
collide with the singular printable `/facture/:id`.

## Phase 0 — Framing: ADRs, visual direction and development topology

**Commit scopes: `adr`, `docs`. No code.**

### 0.1 ADR task

Write three short ADRs from the template, each with a rejected option and reconsideration threshold:

- **ADR-0062** supersedes ADR-0009. Its own threshold, the first truly interactive CRA grid, has
  been reached; the entry grid becomes a SPA. Reject richer server-rendered CSS because it cannot
  provide the required interaction.
- **ADR-0063** supersedes ADR-0048. The API serves built `apps/web/dist` same-origin, retaining one
  deployable and both server-rendered printables. Record Phase 0.3's dev topology.
- **ADR-0064** supersedes ADR-0049. Admit `script-src 'self'`; Phase 9.2 freezes the exact CSP.

Update the README exclusions for front-end frameworks and Playwright e2e, plus the BUILD-RULES
stack table. Use ADR numbers 0062 onward; 0027–0030 and 0032 remain reserved.

### 0.2 Visual direction

Review the five `docs/images/` mockups and write `docs/direction-visuelle.md`. Adapt, do not copy:
a near-black collapsible sidebar, neutral light content, title/breadcrumb topbar and persona block,
KPI cards, dense white tables, rounded dot-and-label status badges, filters/view tabs/pagination,
a vertical-step form, one blue/indigo accent, an Inter-like sans serif, 8–12 px radii and very light
shadows.

The note must pin exact shadcn token hex values; cover the real CRA statuses (`draft`, `submitted`,
`refused`, `validated`, plus late), invoice statuses (`draft`, `issued`,
`cancelledByCreditNote`), declined-day reasons (`notRegie`, `unknownMission`, `noAgreedRate`,
`unknownClient`) and flags (`weekend`, `publicHoliday`); define typography and an ASCII shell
layout; and reject generic cream/terracotta or black/acid “AI” styling.

### 0.3 Development topology

Record verbatim in ADR-0063:

- **Dev:** browser origin `http://127.0.0.1:5173`; Vite proxies `/api`, `/facture`, `/releve`,
  `/healthz`, `/readyz` to port 3000; `.env` uses
  `API_PUBLIC_ORIGIN=http://127.0.0.1:5173`; run `pnpm run api:dev` and
  `pnpm --filter @erp/web dev`.
- **Production/demo:** Fastify serves `apps/web/dist` on 3000 and accepts
  `API_PUBLIC_ORIGIN=http://127.0.0.1:3000` or the public origin. One origin, no CORS, unchanged
  cookie.

**Exit gate:** three template-compliant ADRs; README and BUILD-RULES updated; exact visual tokens
and complete status table; dev topology recorded including environment values.

## Phase 1 — `apps/web` foundation and tooling

**Commit scopes: `web`, `lint`, `ci`, `deps`.**

### 1.1 Workspace member

Create private `@erp/web` with `dev`, `build`, `preview`, `typecheck`; `index.html`; minimal
`src/main.tsx`; and Vite alias/proxy. Source must live under `apps/web/src` because the boundary
gate fails members with no matched source. Justify and quarantine every dependency.

### 1.2 TypeScript

Extend `../../tsconfig.base.json`, add `jsx: react-jsx`, DOM libraries, bundler resolution and
`noEmit`. Keep all base strictness. Add the local typecheck script and ensure the root Node project
does not compile web sources with Node settings.

### 1.3 ESLint

Register the web tsconfig and import resolver; add React Hooks rules. Keep named exports in `src`;
relax default exports only for configuration files. Keep `no-console`.

### 1.4 Boundaries

Keep `pnpm run boundaries` green. As an uncommitted negative proof, import `apps/api` from
`apps/web` and confirm the gate fails.

### 1.5 Playwright foundation

Pin Playwright and axe; configure 1440 desktop plus a 768 responsive shell project, Vite base URL
and visual output. Add a smoke test proving startup without console errors.

### 1.6 CI

Build the web app in CI and create a SHA-pinned Playwright job with Postgres, migration, seed and
build. It may remain manual until Phase 6 provides the journey.

**Exit gate:** root check, web build, smoke test and CI are green.

## Phase 2 — Design system

**Commit scope: `web`.**

### 2.1 Tailwind and shadcn

Initialize them with Phase 0's palette, not defaults. Put shadcn tokens in `styles/globals.css`.

### 2.2 Typography

Self-host Inter or equivalent; the final CSP admits only `font-src 'self'`. Define reusable page,
card, label and help-text levels.

### 2.3 Components

Install only used components: button, input, select, checkbox, label, card, table, tabs, dialog,
sheet, dropdown-menu, popover, tooltip, avatar, badge, separator, skeleton, sonner, breadcrumb,
scroll-area, alert, alert-dialog and collapsible.

### 2.4 `StatusBadge`

One dot-and-French-label component for exactly the four CRA statuses plus late, three invoice
statuses and four declined-day reasons. Move provisional strings to labels in Phase 3.

### 2.5 `StatCard`

Large value, label and optional supporting text. Never invent a “+15% vs last month” delta for a
seed containing one period.

### 2.6 Kitchen sink

Create unlisted `dev.composants` showing every component/variant and capture
`tests/visual/baseline/kitchen-sink.png`.

### 2.7 Motion tokens

Standardize 150–200 ms `ease-out`; honor `prefers-reduced-motion`.

**Exit gate:** baseline captured, no hardcoded component colors, root check green.

## Phase 3 — Data and session against the real API

**Commit scope: `web`.**

### 3.1 API client

Write a thin same-origin credentialed JSON client. Parse every non-2xx response as typed
`ProblemDetails`; do not throw untyped failures.

### 3.2 Problem mapping

Import contracts only through `@erp/contracts`. Branch by problem `type`: session problems redirect
or purge; role/scope problems render `DeniedState`; 400/422 map field errors; 409 maps invariants;
technical errors always expose correlation ids.

### 3.3 Labels

Copy and adapt the French API copy deck, with English keys and French values, including the single
problem-type-to-French-sentence mapping. Do not add a package or a cross-app import.

### 3.4 Formats

Mirror the API's `frenchEuros`, `frenchDate`, `frenchMonth`, `frenchWeekday`, `frenchDays` for
quarter-days and `frenchPercent` for basis points. Align unit tests on identical inputs/outputs.

### 3.5 Query client

Use a reasonable `staleTime`; retry at most once and never retry 4xx business refusals. Invalidate
by feature after mutation.

### 3.6 Session feature

Implement the four session/persona endpoints and `Role = consultant | manager | billing`, with a
`useSession` hook for the shell and guards.

### 3.7 Feature types

Match Appendix A exactly. Zod parsing is optional at the two complex response boundaries.

**Exit gate:** formatter tests mirror the API; four real personas load through the dev proxy; root
check green.

## Phase 4 — Shell, navigation and persona selector

**Commit scope: `web`.**

### 4.1 Persona selector (`/`)

Render one polished card per seeded persona, including role and office. Prominently render the API's
“this is not authentication” notice. Selection posts the persona and redirects to the dashboard.

### 4.2 Shell

Build a dark collapsible Sidebar with icon-only tooltips; a title/breadcrumb Topbar; and a persona
block showing name, role, office and “change persona”. Changing persona deletes the selection and
returns to `/`. Reserve, but do not populate, future extension areas.

### 4.3 Configuration-driven navigation

Use typed `{ id, label, icon, path, roles }` entries. All roles get Dashboard; consultant gets My
CRA; manager gets Pré-facturier, CRA, Invoices and Margin; billing gets Pré-facturier and Invoices.
The Sidebar reads only this configuration. Future routes render designed “coming soon” pages.

### 4.4 Guards and global states

No persona redirects to `/`. An unknown persona purges the cookie and redirects with an explanation
defined by ADR-0074. Render a styled 404 and a global French problem-aware error boundary with the
correlation id.

### 4.5 Interaction

Highlight active parent routes, use the Phase 2 motion tokens, and render the Sidebar in a `Sheet`
below `md`.

**Exit gate:** each persona sees exactly its role's navigation; a cookie-less deep link redirects;
persona shell screenshots captured; root check green.

## Phase 5 — Missing backend reads, test-first

**Commit scope: `api`.** Follow `apps/api/src/routes/api.ts`: Zod at the boundary, route roles as
data, RFC 9457 refusals and repository office scope. Write each real-Postgres integration test
before its route and reuse existing compositions. The query parameter is `period`, never `periode`.

### 5.1 `GET /api/v1/pre-facturier?period=YYYY-MM`

Manager and billing only, scoped to the actor's office. Return:

```ts
{
  period,
  summary: { billableCents, lateDays, craCount },
  invoices: [InvoiceListItem],
  cras: [{
    craId, consultantId, consultantName, status, late, recordedQuarterDays,
    blockingReasons: [string], decidable
  }]
}
```

Assert exact seeded values, no-persona 401, consultant role 403 and Lyon/Paris scope.

### 5.2 `GET /api/v1/cras/:period/grid`

Expose the month skeleton, non-workable flags, assigned missions and current CRA status, lines and
refusal. Assert Alice's split day, absence and flagged Saturday, an empty month, 401 and 403.

### 5.3 `GET /api/v1/dashboard?period=YYYY-MM`

Use honest repository aggregates only: consultant month status/recorded/remaining quarter-days;
manager pending decisions, office billable cents and late CRAs; billing draft/issued counts and
issued TTC cents. Never return `Cjm`, `Tjm` or margin. Assert exact seeded values for each role.

**Exit gate:** integration suite and root check green; negative tests included; dashboard payloads
mechanically exclude margin fields.

## Phase 5bis — Quarter-days become the unit (ADR-0069)

**Commit scopes: `adr`, `api`, `docs`, `test`, `web` as applicable.** Decided 26/08/2026: real
usage needs quarter-days, exactly triggering ADR-0012's threshold. This phase precedes the grid
rebuild and must finish green. It is not a blind rename: every assertion is reread for intent.

### 5bis.1 Platform value

Replace half-days with `QuarterDays`, `QUARTER_DAYS_PER_DAY = 4` and a factory rejecting fractions,
negatives and `NaN`. Rename event `MissionHalfDays` to `MissionQuarterDays`. Test the factory first.

### 5bis.2 Timesheet invariants

`CraLine` carries 1–4 quarters; rename `halfDaysOn`; keep overbooking and month-completeness rules
on the shared constant. Re-read every test: overbooking becomes `4 + 1`, and incomplete workable
days, typed errors and French messages remain proven. Do not duplicate domain rules client-side.

### 5bis.3 Billing division

Use `QUARTER_DAYS_PER_DAY` at the single division site and assert `tjmCents % 4 === 0`. A whole-euro
Tjm is divisible by four in cents. Rename quantities and origins to quarter-days. Keep the
`unitPrice × quantity === amountCents` reference test.

### 5bis.4 Migration and seed

Migration `011-quarter-days.sql` renames the four half-day columns and replaces their checks. Do not
edit old migrations and do not migrate data: the deterministic seed resets the database (ADR-0022).
Regenerate the seed with full days equal to four and at least one four-quarter day in Alice's
validated June, so the proof reaches billing end to end. June stays validated for everyone except
Claire; Alice's editable month is current `2026-08`.

### 5bis.5 API contract

- `PUT /api/v1/cras/:period/entries` accepts one `quarterDays` entry per non-empty cell and at most
  124 entries.
- `record-month.ts` sums duplicate `(day, dayType, missionId)` entries into one line; test duplicates
  before changing the code.
- Grid missions include `assignableDays` so the client can disable dates outside an assignment.
- Grid composition includes `validatedBy`.
- Rename server-rendered dashboard/printable fields to quarter-days.

### 5bis.6 Web compilation

`frenchDays` formats quarters and CRA list values as days under “Jours saisis”. Update types but do
not rebuild the grid before Phase 6.

### 5bis.7 Documentation

Update living documents (BUILD-RULES, CONTEXT, README, visual direction and this plan); preserve
dated records. Replace `HalfDays` with `QuarterDays` throughout current vocabulary, remove
`HalfDaySlot`, update the five dependent terms and remove the now-built two-mission limit from the
README. ADRs and earlier dated checkpoint prose remain historical.

**Exit gate:** root check, integration suite and existing e2e green; no live half-day identifiers in
packages/apps/migrations; an end-to-end test records four quarters and reads four lines.

## Phase 6 — Flagship My CRA matrix

**Commit scope: `web`.** This is the interaction that triggered ADR-0009's threshold.

This phase was reopened after the first one-day-per-row, two-slot delivery. ADR-0069/0070 preserve
the list, data hooks, routing, four statuses and empty/denied states; rebuild the grid and remove
`features/cra/slots.ts`, its tests and `LABELS.cra.slotsNote`.

### 6.1 Month list corrections

Keep the screen, label values as recorded days, remove the unrequested month filter from a two-row
table, and retain the designed empty state with an action to open the current period.

### 6.2 Activity-by-day matrix

- Rows are entered assigned missions plus Absence. Unused missions are added explicitly.
- Columns are every day in a horizontal scroller, with ISO week headers and weekday/day labels.
- Each cell is a native five-option select: empty, quarter, half, three-quarters or full day. Remove
  OS chrome so it reads as a grid cell.
- Non-workable columns remain editable and visibly neutral; Absence has a dedicated tone; missions
  have stable per-row tones; dates outside `assignableDays` are inert, `aria-disabled` and explain
  the assignment constraint without a forbidden DOM `title` attribute.
- Day totals and activity totals read the same local state. Highlight a workable day below one full
  day, but let the domain make every refusal.

Do not build paid-leave/RTT/sick-leave types: the domain knows `worked` and `absence`, and the README
records the deliberate exclusion.

### 6.3 Matrix-only actions

Provide row actions to fill empty workable zero-total days, clear a row, and remove an already-empty
row; add assigned hidden missions; provide adjacent-period navigation guarded by an unsaved-change
confirmation. These mutate only local state and are reconciled by the whole-month PUT, then refetched
(ADR-0050, ADR-0067).

### 6.4 Keyboard and accessibility

Support two-axis arrows, row Home/End, always-visible focus and scroll-into-view. Use a semantic table
with month caption, scoped date/activity headers and a cell label naming activity and date. Axe must
report no critical/serious violation.

### 6.5 Save and submit

PUT the whole month with at most 124 non-empty entries. Stay refetch-driven, make toast verbs match
their actions, map 400/422 fields to cells, and identify incomplete days at the totals row.

### 6.6 Four CRA statuses

- `draft`: editable, Save and Submit.
- `refused`: editable with the API refusal reason.
- `submitted`: read-only, awaiting decision.
- `validated`: read-only, names `validatedBy`, links to `/releve/:id` in a new tab.

Do not show ADR ids or translate `Cra` as “time report”.

### 6.7 Boundary states and review defects

Render an inviting empty matrix; a centered explanatory 403; the period in title/breadcrumb; a
full-height Sidebar; and ensure the true out-of-scope screenshot comes from J5 rather than an
insufficient-role state.

### 6.8 Exit gate — rewritten J1

Run serially after database reset:

1. Read immutable `/cra/2026-06` as a matrix and assert split 11 June, four-quarter day, 18 June
   absence, flagged Saturday, named validator and no editable cells.
2. Navigate to empty editable `/cra/2026-08`.
3. Add an activity, enter a quarter, observe the day total, fill empty workable days, save, reopen,
   submit and assert read-only `submitted`.

Axe the grid, capture all seven states, and keep the root check green.

## Phase 7 — Pré-facturier and Margin

**Commit scope: `web`.**

### 7.1 Pré-facturier

Use Phase 5.1 data with a period selector, three KPI cards, a billable invoice table and a CRA table
showing consultant, status, late flag, recorded days, explicit blocking reasons and actions. Never
put Tjm or margin in these tables.

### 7.2 Validate

Manager validation renders a result dialog containing every draft invoice created per client and
every declined-day reason in French. A replay is informative, not an error.

### 7.3 Refuse

Require a 1–500 character reason. After submission, render `refused`; Alice sees the same reason in
her editable grid banner.

### 7.4 Billing reads but does not decide

Do not render Validate or Refuse for billing; keep the read view.

### 7.5 Margin

Managers reach `/marge/$consultantId?period=` through an explicit Pré-facturier action, never hover,
because every read is logged. Show Cjm, per-mission days/Tjm/revenue/cost/margin and totals using
exact formatters. Do not calculate a margin percentage by dividing money.

### 7.6 Required states and journeys

Render billing's designed insufficient-role margin 403, an empty July Pré-facturier and Lyon
manager's designed out-of-scope Paris CRA 403.

**Exit gate:** after J1, J2 validates seeded submitted Claire and displays the Réunion client's
8.5% VAT draft plus every decline; J3 refuses Alice with a visible reason; J5 proves office scope;
J6 proves billing cannot read margin. Axe the Pré-facturier, capture the empty state, root check
green.

## Phase 8 — Invoices, issuance and dashboard

**Commit scope: `web`.**

### 8.1 Invoice list

Render client, real status, period, optional legal number and optional TTC. Draft TTC remains null.
Filter by status using view tabs.

### 8.2 Invoice detail

Render seller, billed party, dates, period, terms, lines with mission/CRA origin, integer quantity,
unit price and amount, VAT breakdown by basis-point rate, and totals only when issued. Open the
singular SSR `/facture/:id` printable in a new tab.

### 8.3 Issuance

Billing gets a confirmation dialog and generated 8–200 character `Idempotency-Key` using
`crypto.randomUUID()`. On success show `SEC-2026-…` and invalidate the list. A replay is informative;
a new key against an issued invoice renders the typed 409. Managers never see the action.

### 8.4 Dashboard

Render Phase 5.3 role-specific KPI cards and actionable links. This is the first post-selector
screen and receives maximum polish. Do not fabricate a one-point chart.

### 8.5 Empty invoice state and J4

A fresh seed demonstrates the designed empty list. After J2, billing opens its draft, issues it,
asserts `SEC-2026-\d{6}` and proves idempotent replay. Capture all three role dashboards; axe list,
detail and dashboard; root check green.

## Phase 9 — Serving the SPA from the API

**Commit scopes: `api`, `web`, `ci`.** Every risky touch is enumerated.

### 9.1 Serve `apps/web/dist`

Add justified, quarantined `@fastify/static`. Serve assets and return `index.html` for screen GETs,
while preserving `/api/*`, exact-shape `/facture/:id`, exact-shape `/releve/:id`, health endpoints
and assets. **Never implement this with bare `startsWith('/facture')`**: plural SPA `/factures`
shares that prefix. Use registered routes or exact `/:id` shapes. Existing routing e2e must prove
both Vite and served-build topologies.

### 9.2 CSP

The original exact string was:

```text
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self';
font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self';
frame-ancestors 'none'
```

On 27/08/2026 ADR-0072 superseded ADR-0064 on one clause: `style-src` is now
`'self' 'unsafe-inline'` because Radix and sonner render style attributes that cannot carry a nonce
or hash. `script-src` remains `'self'` and a negative test proves it. Keep one policy for all
responses and preserve `nosniff`, same-origin referrer policy and frame denial.

### 9.3 Closed removal inventory

Remove replaced interactive server pages and their route registrations, plus only helpers proven
dead by typecheck/coverage. Retain CRA/invoice printables, shell/format/labels/rendering/problem and
representation machinery, and printable CSS assets.

### 9.4 Closed test inventory

Update or justifiably delete the tests for removed screens; never skip them. Keep CSP and static
route assertions, refocus shell/accessibility on printables, prove endpoint tests replace removed
screen-logic assertions, and retain session/origin/refusal cases.

### 9.5 Environment and execution

Document dev 5173 vs served 3000 `API_PUBLIC_ORIGIN`. Production order is web build then API start.

### 9.6 CI and exit gate

Enable Playwright with Postgres → migrate/seed → web build → API serving `dist` → full e2e. The
served-build full suite, including two-way route collision tests, must pass; root check and
integration tests must pass; CSP tests must pass; no replaced interactive SSR route may answer.

## Phase 10 — Polish, accessibility, performance and demo acceptance

**Commit scopes: `web`, `docs`, `test`.**

### 10.1 Consistency

Use one Skeleton pattern, uniform toast position/duration/style, coherent interaction states and a
Playwright reduced-motion emulation. Remove decoration that contributes neither readability nor
hierarchy.

### 10.2 Accessibility

Run axe on selector, three role dashboards, CRA list/grid, Pré-facturier, margin, invoice
list/detail and 403/404 states. Require zero critical/serious violations. Prove complete keyboard
shell navigation and always-visible focus. ADR-0061's mechanical baseline still applies: no DOM
`title` attributes and correctly scoped headers.

### 10.3 Performance

Use TanStack route code-splitting, inspect the bundle for disproportionate modules, and require
desktop Lighthouse Performance and Accessibility above 90 for dashboard and Pré-facturier.

### 10.4 Demo checklist

Write `docs/demo-checklist.md` as the exact CEO script and final Playwright journey: reset → selector
notice → Alice's seeded matrix, edit and submit → Bruno dashboard, Pré-facturier, Claire validation,
Alice refusal and margin → Emma scope 403 → Henri invoice issuance, printable tab and margin 403 →
selector.

### 10.5 Full regression

From cold `pnpm run setup`, run root check, integration suite and full Playwright in one documented
sequence.

### 10.6 Baseline and project exit gate

Freeze `tests/visual/baseline/`. Everything must pass cold, and the final journey must replay without
manual intervention. Human review of `tests/visual/review/` remains an explicit out-of-agent-scope
checkbox rather than a claimed pass.

## Appendix A — Pinned API contract

### Session

| Method and path                  | Contract                                                     |
| -------------------------------- | ------------------------------------------------------------ |
| `GET /api/v1/personas`           | `{ notice, personas: [{ key, role, displayName, office }] }` |
| `GET /api/v1/session`            | `{ persona: PersonaSummary                                   | null }` |
| `POST /api/v1/session/persona`   | `{ key }` → selected persona and cookie; unknown key → 404.  |
| `DELETE /api/v1/session/persona` | `{ persona: null }` and cleared cookie.                      |

### Timesheet

| Method and path                    | Roles | Contract                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/cras?limit&offset`    | c,m,b | Limit 1–200, default 20; `>200` is 400, never clamped (ADR-0081 — this route alone; every other list stays at 50). Optional `consultantIds`, `statuses`, `year` and `month` filters, ANDed with each other, never widening scope. Out-of-scope rows are filtered. Items contain id, consultant, office, period, status and recorded quarter-days. |
| `GET /api/v1/cras/:id`             | c,m,b | Full lines/flags/status/validator. Missing is 404; existing but out of scope is 403.                                                                                                                                                                                                                                                              |
| `PUT /api/v1/cras/:period/entries` | c     | `{ submit, entries: [{ day, dayType, missionId                                                                                                                                                                                                                                                                                                    | null, quarterDays }] }`, at most 124, whole-month replacement. |
| `POST /api/v1/cras/:id/validation` | m     | Returns replay flag, invoices and declined quarter-days. Replay is 200, not 409.                                                                                                                                                                                                                                                                  |
| `POST /api/v1/cras/:id/refusal`    | m     | Reason 1–500; returns refused. Scope 403, missing 404, blank reason 422, wrong state 409.                                                                                                                                                                                                                                                         |
| `GET /api/v1/cras/:period/grid`    | c     | Month skeleton, missions, assignable days and CRA state.                                                                                                                                                                                                                                                                                          |
| `GET /api/v1/consultants`          | m     | The manager's own office roster, `{ id, displayName }` only — no Tjm, Cjm or margin. Unpaginated by ADR-0077. A consultant or billing persona gets 403.                                                                                                                                                                                           |

### Billing

| Method and path                                 | Roles | Contract                                                                                                             |
| ----------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/invoices?limit&offset`             | m,b   | Items include status, period, billed party, optional number/date/TTC.                                                |
| `GET /api/v1/invoices/:id`                      | m,b   | Frozen document, lines/origins/VAT; totals null while draft, present once issued and after a credit note cancels it. |
| `POST /api/v1/invoices/:id/issuance`            | b     | Requires 8–200 `Idempotency-Key`; missing 400, reused elsewhere 409; returns legal number/date/TTC/replay.           |
| `GET /api/v1/consultants/:id/economics?period=` | m     | Cjm and per-mission/total integer-cent economics; every read logged; billing gets 403.                               |
| `GET /api/v1/pre-facturier?period=`             | m,b   | Phase 5.1 composition.                                                                                               |
| `GET /api/v1/dashboard?period=`                 | c,m,b | Phase 5.3 role aggregate.                                                                                            |

Printable documents remain `GET /facture/:id` for manager/billing and `GET /releve/:id` for all
roles, opened by the SPA in new tabs.

### Problem contract

Transport/session problem types include malformed request (400), no persona (401), unknown persona,
forbidden origin, insufficient role, out of scope (403), not found (404), missing idempotency key
(400) and reused idempotency key (409). Domain refusal statuses stay exact: 422 for refused values,
409 for state conflicts, 403 for actors. Render typed invariants, reasons and `deniedBy`; a 403
never leaks record details.

### Deterministic seed

| Persona                         | Demonstrates                                                          |
| ------------------------------- | --------------------------------------------------------------------- |
| `consultant-paris` Alice Martin | Split 11 June, a four-quarter day, 18 June absence, flagged Saturday. |
| `manager-paris` Bruno Leroy     | Claire's submitted Paris CRA, validation/refusal and margin.          |
| `manager-lyon` Emma Robert      | Designed out-of-scope refusal.                                        |
| `billing-paris` Henri Laurent   | Idempotent issuance and margin role refusal.                          |

The seed contains five clients spanning the VAT cases and seven missions including PASSI and an
internal Forfait Intercontrat. Reset with `pnpm run db:reset`; cold setup uses `pnpm run setup`.

## Appendix B — Six end-to-end journeys

| Journey | Persona     | Flow                                                        | Phase |
| ------- | ----------- | ----------------------------------------------------------- | ----- |
| J1      | Alice       | Read June matrix, edit current month, save and submit.      | 6     |
| J2      | Bruno       | Validate seeded Claire; observe drafts and declined days.   | 7     |
| J3      | Bruno/Alice | Refuse Alice with a reason; Alice sees it.                  | 7     |
| J4      | Henri       | Issue J2 invoice with a key; prove legal number and replay. | 8     |
| J5      | Emma        | Deep-link a Paris CRA; receive designed out-of-scope 403.   | 7     |
| J6      | Henri       | Deep-link margin; receive designed insufficient-role 403.   | 7     |

Run serially on a shared database reset in global setup: J1 → J2/J3 → J4. Read-only J5/J6 may run
after J1. Use exact assertions supported by the deterministic seed.

## Appendix C — Anti-drift pins

1. Dev browser origin is Vite 5173 proxying Fastify 3000; production is Fastify same-origin.
2. ADR-0072 is authoritative for the final single CSP.
3. Phase 9 removal and test inventories are closed; touch nothing else and skip nothing.
4. API query parameters use `period`; French screen URLs may use French wording.
5. Keep named exports in web source; relax only config files.
6. Pin dependencies at least seven days old; never add MSW or faker.
7. Use only current commit scopes and never add co-author trailers.
8. Labels/formatters are copied into the web app, not shared or imported cross-app.
9. `/factures/$id` is SPA plural and `/facture/:id` is SSR singular. Prefix matching must use a
   terminating slash or exact route shape; routing e2e proves both topologies.
10. Playwright is serial, seeded, has no fixed sleeps and may assert exact values.
11. ADR numbering starts at 0062+; reserved numbers stay untouched.
12. Never expose Cjm, Tjm or margin outside the dedicated margin screen.
