import {
  CalendarCheckIcon,
  FileTextIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  ReceiptTextIcon,
  TrendingUpIcon,
} from 'lucide-react';

import type { Role } from '@/features/session/types';
import { LABELS } from '@/lib/labels';

/**
 * frontend-plan.md task 4.3: "La Sidebar lit exclusivement ce tableau" — no JSX branch in
 * `components/shell/sidebar.tsx` decides which entries a role sees; this array, filtered by
 * `navigationForRole`, is the only place that decision is made. Adding a module to the nav is
 * editing this file, never the component that renders it.
 *
 * This module is a **composition root for the shell**, not a feature: it names paths and reads
 * `Role` from `features/session` (the one feature every screen already depends on for who is
 * asking), and nothing else under `features/`. A `NavEntry` never imports a type from
 * `features/cra`, `features/factures`, `features/pre-facturier` or `features/marge` — doing so
 * would be the same `billing → timesheet`-shaped arrow `docs/open-questions.md` (row dated
 * 24/08/2026) already caught once inside `features/`, one tier further out, where dependency-cruiser
 * cannot see it either.
 */
export interface NavEntry {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly path: string;
  readonly roles: readonly Role[];
}

const CONSULTANT: readonly Role[] = ['consultant'];
const MANAGER: readonly Role[] = ['manager'];
const MANAGER_AND_BILLING: readonly Role[] = ['manager', 'billing'];
const ALL_ROLES: readonly Role[] = ['consultant', 'manager', 'billing'];

/**
 * Two entries share the path `/cra` on purpose (`cra-mine`, `cra-office`): task 4.3's per-role
 * wording is genuinely different — a consultant's own month ("Mes CRA",
 * `LABELS.cra.nav`) and a manager's office-wide list ("CRA", `LABELS.cra.navManager`) are not the
 * same sentence, and `Role` filtering already makes the two mutually exclusive for any one
 * session, so no session ever sees both. That keeps the label a plain data field instead of a
 * function of the viewer's role, which is what "the Sidebar reads this array exclusively" means in
 * practice.
 *
 * `marge` points at `/marge`, a route `docs/frontend-plan.md` §3 does not pin (only
 * `/marge/$consultantId` is pinned) — task 4.3 needs a landing target for the nav entry and the
 * plan does not name one. Added here as a placeholder index route; recorded as a checkpoint point
 * (`docs/open-questions.md`) rather than silently extending §3's list. Whether this entry survives
 * Phase 7 at all is a second, separate open question: §7.5 reaches the margin screen only by
 * explicit navigation from a pré-facturier row, never from the sidebar, so a persistent "Marge"
 * nav item may not be the shape Phase 7 wants either.
 */
export const NAVIGATION: readonly NavEntry[] = [
  {
    id: 'dashboard',
    label: LABELS.dashboard.heading,
    icon: LayoutDashboardIcon,
    path: '/tableau-de-bord',
    roles: ALL_ROLES,
  },
  {
    id: 'pre-facturier',
    label: LABELS.preFacturier.nav,
    icon: ReceiptTextIcon,
    path: '/pre-facturier',
    roles: MANAGER_AND_BILLING,
  },
  {
    id: 'cra-office',
    label: LABELS.cra.navManager,
    icon: CalendarCheckIcon,
    path: '/cra',
    roles: MANAGER,
  },
  {
    id: 'cra-mine',
    label: LABELS.cra.nav,
    icon: CalendarCheckIcon,
    path: '/cra',
    roles: CONSULTANT,
  },
  {
    id: 'factures',
    label: LABELS.invoice.nav,
    icon: FileTextIcon,
    path: '/factures',
    roles: MANAGER_AND_BILLING,
  },
  {
    id: 'marge',
    label: LABELS.margin.heading,
    icon: TrendingUpIcon,
    path: '/marge',
    roles: MANAGER,
  },
] as const;

/** The one function the shell calls — filtering, in array order, never re-sorted by the caller. */
export function navigationForRole(role: Role): readonly NavEntry[] {
  return NAVIGATION.filter((entry) => entry.roles.includes(role));
}

/**
 * The topbar's page title (`components/shell/topbar.tsx`) is read off the same array the sidebar
 * is, rather than a second per-route title string that could say something different from the nav
 * entry a visitor just clicked — the entry whose `path` is a prefix of the current location wins,
 * so a placeholder child route (`/cra/2026-06`, not yet built) still carries its parent's label.
 * `undefined` for a route this session's role has no entry for at all (a styled 404's territory,
 * not this function's).
 */
export function navEntryForPath(
  entries: readonly NavEntry[],
  pathname: string,
): NavEntry | undefined {
  const candidates = entries.filter(
    (entry) => pathname === entry.path || pathname.startsWith(`${entry.path}/`),
  );

  return candidates.sort((a, b) => b.path.length - a.path.length)[0];
}
