import {
  CalendarCheckIcon,
  CalendarOffIcon,
  FileTextIcon,
  IdCardIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  ReceiptTextIcon,
  UserRoundCheckIcon,
  WalletIcon,
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
 * No `marge` entry: Phase 4 added one pointing at `/marge`, a route §3 never pinned (only
 * `/marge/$consultantId` is), as a landing target task 4.3 needed and the plan did not name.
 * `docs/open-questions.md` (row dated 24/08/2026) recorded both questions that placeholder raised
 * and named this phase to decide them with a real margin screen in front of it. Decided in Phase 7,
 * task 7.5: §7.5 reaches the margin screen only by an explicit click on a pré-facturier row — "jamais
 * un survol" — because every read is a logged disclosure (ADR-0052), and a standing sidebar entry
 * is the opposite of that: it invites exactly the idle browsing the click-through exists to
 * prevent, for a consultant chosen from a list this route does not have. The nav entry and its
 * `/marge` index route are removed; `/marge/$consultantId` (the pinned route) keeps working, its
 * page title resolved directly from the URL by `routes/_shell.tsx`'s `titleFor` (same mechanism
 * `/cra/$period` already uses for a title no static nav entry could carry).
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
    id: 'assignments',
    label: LABELS.assignment.nav,
    icon: UserRoundCheckIcon,
    path: '/affectations',
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
  /** Item 20, QA round 3: three placeholder pages (`ComingSoon`, no screen behind them yet),
   * every role, listed consecutively so they read as one small group in the sidebar without a
   * submenu affordance `NavEntry`/`Sidebar` do not otherwise support. */
  {
    id: 'mes-informations',
    label: LABELS.selfService.mesInformationsNav,
    icon: IdCardIcon,
    path: '/mes-informations',
    roles: ALL_ROLES,
  },
  {
    id: 'mes-notes-de-frais',
    label: LABELS.selfService.mesNotesDeFraisNav,
    icon: WalletIcon,
    path: '/mes-notes-de-frais',
    roles: ALL_ROLES,
  },
  {
    id: 'mes-absences',
    label: LABELS.selfService.mesAbsencesNav,
    icon: CalendarOffIcon,
    path: '/mes-absences',
    roles: ALL_ROLES,
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
