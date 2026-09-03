import { createFileRoute, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { useState } from 'react';

import type { PageHeaderParentCrumb } from '@/components/shell/page-header';
import { Sidebar } from '@/components/shell/sidebar';
import { Topbar } from '@/components/shell/topbar';
import { navEntryForPath, navigationForRole } from '@/config/navigation';
import { sessionQueryOptions } from '@/features/session/hooks';
import { frenchMonth } from '@/lib/format';
import { LABELS } from '@/lib/labels';

/**
 * Defect D2 (Phase 6 revue du 25/08): "le titre et le fil d'Ariane nomment le mois — sur l'écran
 * livré le 25/08, rien n'indiquait quel mois était ouvert." `navEntryForPath`'s label is the same
 * static string for every period (`/cra/$period` and `/cra/$period/$consultantId` both fall under
 * the one `cra-*` nav entry), so the fix reads the period straight off the URL here rather than
 * inventing a route-to-shell context channel for one string. `/cra/$period` is the only route this
 * matters for — Annexe C.3's own routing table names no other screen with a period in its path.
 */
const CRA_PERIOD_IN_PATH = /^\/cra\/(\d{4}-\d{2})(?:\/|$)/u;

/**
 * `/marge/$consultantId` (Phase 7, task 7.5) has no nav entry at all — `config/navigation.ts`'s
 * own comment explains why (a click-through the sidebar must not offer) — so `activeEntry` below
 * is `undefined` for it and `entryLabel` falls back to `LABELS.appName`, which would show "CRA →
 * Facture" as the page title for a screen that is very much not that.
 */
const MARGE_PATH_PREFIX = '/marge/';
const INVOICE_DETAIL_PATH = /^\/factures\/[^/]+$/u;

function titleFor(
  entryLabel: string,
  pathname: string,
  search: Readonly<Record<string, unknown>>,
): string {
  if (pathname.startsWith(MARGE_PATH_PREFIX)) return LABELS.margin.heading;

  if (INVOICE_DETAIL_PATH.test(pathname)) {
    const client = typeof search['client'] === 'string' ? search['client'] : null;
    const period = typeof search['period'] === 'string' ? search['period'] : null;
    if (client !== null && period !== null) {
      return `${client} — ${frenchMonth(period)}`;
    }
  }

  const match = CRA_PERIOD_IN_PATH.exec(pathname);
  if (match?.[1] === undefined) return entryLabel;

  return `${entryLabel} — ${frenchMonth(match[1])}`;
}

const PRE_FACTURIER_PATH_PREFIX = '/pre-facturier';

/**
 * O12's one middle crumb: `/factures/$id` (task 8.2) is reached from two different lists — the
 * invoice list and the pré-facturier — so "Factures" alone would misname the way back for the
 * second. `search['from']` is the same string `invoice-detail-screen.tsx`'s own "Retour à la
 * liste" already reads (`routes/_shell/factures.$id.tsx`'s `from`, task 8.2) — read again here
 * rather than threaded through a second channel, and validated the same narrow way `titleFor`
 * reads `client`/`period` off the raw location search above.
 */
function parentCrumbFor(
  pathname: string,
  search: Readonly<Record<string, unknown>>,
): PageHeaderParentCrumb | undefined {
  if (!INVOICE_DETAIL_PATH.test(pathname)) return undefined;

  const from = typeof search['from'] === 'string' ? search['from'] : null;
  if (from === null) return undefined;

  const label = from.startsWith(PRE_FACTURIER_PATH_PREFIX)
    ? LABELS.preFacturier.nav
    : LABELS.invoice.nav;

  return { label, href: from };
}

/** A UI preference (direction-visuelle.md §6: "collapse state is a UI preference, not session
 * state") — `localStorage`, never sent to the API, never part of `useSession`'s cache. */
const SIDEBAR_COLLAPSED_KEY = 'erp:sidebar-collapsed';

function readStoredCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    // Private browsing, storage disabled, or no `window` yet — the sidebar simply starts expanded.
    return false;
  }
}

function writeStoredCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // Same as above: the preference just does not persist across reloads.
  }
}

/**
 * The layout route every protected screen nests under (`docs/frontend-plan.md` §3's `_shell`).
 * `beforeLoad` is frontend-plan.md task 4.4's "no session → redirect to `/`" guard: it reads the
 * session through `ensureQueryData(sessionQueryOptions)` — the exact query `useSession` itself
 * reads, so a persona chosen one screen ago is not fetched twice — and throws a `redirect` before
 * this layout, or anything nested under it, ever paints. A deep-link with no cookie therefore never
 * flashes the shell: Playwright can assert the final URL, not a transient.
 *
 * `GET /api/v1/session` is `PUBLIC` (`apps/api/src/routes/session.ts`) and never itself answers
 * `/problems/no-persona` or `/problems/unknown-persona` — verified against the route, not assumed
 * — so this guard is a plain client-side check on `persona === null`, not a caught `ApiProblemError`.
 * The two problem types are handled globally instead, by `features/session/session-guard.ts`, for
 * whichever later phase's guarded fetch can actually produce them.
 */
export const Route = createFileRoute('/_shell')({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
    if (session.persona === null) {
      // `throw redirect(...)` is TanStack Router's own documented pattern for a `beforeLoad`
      // guard: `redirect()` returns a `Response` (`router-core`'s `redirect.ts`), which the
      // router's own machinery catches by type, not by `instanceof Error`. `only-throw-error`
      // (eslint.config.js) does not know that vocabulary — this is the one call site in the SPA
      // that throws a non-`Error` value, and it is a framework contract rather than a bug to work
      // around. The alternative (`redirect({ throw: true })`, no local `throw` keyword) satisfies
      // the rule but throws the type-narrowing below away with it: TypeScript cannot see that a
      // call it does not recognise as `never`-returning always exits the function, and
      // `session.persona` would read as `PersonaSummary | null` past this block.
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw redirect({ to: '/' });
    }

    return { persona: session.persona };
  },
  component: ShellLayout,
});

function ShellLayout(): ReactElement {
  const { persona } = Route.useRouteContext();
  const [collapsed, setCollapsed] = useState(readStoredCollapsed);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });

  const entries = navigationForRole(persona.role);
  const activeEntry = navEntryForPath(entries, pathname);
  const title = titleFor(activeEntry?.label ?? LABELS.appName, pathname, search);
  const parent = parentCrumbFor(pathname, search);
  const showBreadcrumb = activeEntry?.path !== '/tableau-de-bord';

  const toggleCollapsed = (): void => {
    setCollapsed((previous) => {
      const next = !previous;
      writeStoredCollapsed(next);

      return next;
    });
  };

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <Sidebar entries={entries} collapsed={collapsed} onToggleCollapse={toggleCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          title={title}
          showBreadcrumb={showBreadcrumb}
          parent={parent}
          entries={entries}
          persona={persona}
        />
        <main id="main-content" className="flex-1 overflow-y-auto">
          <div className="mx-auto flex max-w-[1360px] flex-col gap-6 px-3 py-4 sm:px-6 sm:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
