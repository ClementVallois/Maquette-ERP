import { Link } from '@tanstack/react-router';
import { ChevronRightIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { LABELS } from '@/lib/labels';

/** O12's one middle crumb — a plain `href` rather than a typed `to`: the caller already built one
 * (`invoice-detail-screen.tsx`'s own `returnTo`, task 8.2's "retour à la liste en conservant ses
 * filtres"), and re-typing it against the router's route templates would duplicate that logic
 * rather than reuse it. */
export interface PageHeaderParentCrumb {
  readonly label: string;
  readonly href: string;
}

interface PageHeaderProps {
  readonly title: string;
  /**
   * Item 4, QA round 5: what the bare `<h1>` below shows **below `md`** instead of `title`, when
   * `title` itself is too long there — `/cra/$period`'s "Mes CRA — septembre 2026" has no room
   * next to nothing else on a phone, and the ellipsis `truncate` adds cuts the month in half
   * rather than dropping it cleanly. Equal to `title` on every route this round did not touch
   * (`_shell.tsx`'s `mobileTitleFor`), so `<ResponsiveTitle>` below is then rendering the same
   * text twice, once per breakpoint span — never two different strings a screen reader would
   * announce both of, since `display:none` (`md:hidden`/`hidden md:inline`) removes the other
   * span from the accessibility tree entirely, the same reasoning item 33's breadcrumb comment
   * below already relies on.
   */
  readonly mobileTitle: string;
  /** Omitted on the dashboard itself — a breadcrumb back to the page you are already on is noise. */
  readonly showBreadcrumb: boolean;
  /** The one level between "Tableau de bord" and `title` — `/factures/$id`'s own "Factures" or
   * "Pré-facturier", so far the only screen reached from two different lists (A10). `undefined`
   * everywhere else: every other screen is a direct child of the dashboard. */
  readonly parent?: PageHeaderParentCrumb | undefined;
}

/** The one `<h1>` both branches below render, `truncate`d exactly as before — the only change is
 * *which* string shows below `md` (item 4, QA round 5). */
function ResponsiveTitle({
  title,
  mobileTitle,
}: {
  readonly title: string;
  readonly mobileTitle: string;
}): ReactElement {
  return (
    <h1 className="text-page-title truncate">
      <span className="md:hidden">{mobileTitle}</span>
      <span className="hidden md:inline">{title}</span>
    </h1>
  );
}

/**
 * The topbar's left-hand content (direction-visuelle.md §6): page title, and a breadcrumb back to
 * the dashboard when the route is not the dashboard itself. Extracted from `Topbar` as its own
 * component per `docs/frontend-plan.md` §3's tree (`components/shell/PageHeader`) — the piece a
 * later phase's page-local header (inside a card, not the topbar) can reuse without pulling in the
 * persona block that lives beside it in `Topbar`.
 */
export function PageHeader({
  title,
  mobileTitle,
  showBreadcrumb,
  parent,
}: PageHeaderProps): ReactElement {
  if (!showBreadcrumb) {
    return <ResponsiveTitle title={title} mobileTitle={mobileTitle} />;
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* Item 33 (QA round 3, mobile design): `hidden lg:block`, the same breakpoint
          `topbar.tsx`'s own burger trigger and `sidebar.tsx` already treat as "mobile" in this
          shell — below it, the `<h1>` below is the only page label shown. `display:none` removes
          the trail from the accessibility tree entirely rather than leaving it there for
          assistive tech to still announce (axe runs in CI, and a hidden-but-announced breadcrumb
          would be worse than not rendering it here at all). */}
      <Breadcrumb className="hidden lg:block">
        {/* `flex-nowrap`, overriding the primitive's own `flex-wrap`: this row must stay one
            line — wrapping would grow past the topbar's fixed height instead of the ellipsis
            below. Every crumb but the last is `shrink-0` (short, fixed strings); the last one
            (`title`, built from a client name and a month — the one crumb long enough to
            threaten the row) is the only one allowed to shrink and carries `truncate`, so it is
            the one that gives way first. */}
        <BreadcrumbList className="flex-nowrap">
          <BreadcrumbItem className="shrink-0">
            <BreadcrumbLink asChild>
              <Link to="/tableau-de-bord">{LABELS.shell.breadcrumbHome}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className="shrink-0">
            <ChevronRightIcon className="size-3.5" />
          </BreadcrumbSeparator>
          {parent !== undefined && (
            <>
              <BreadcrumbItem className="shrink-0">
                <BreadcrumbLink asChild>
                  <a href={parent.href}>{parent.label}</a>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="shrink-0">
                <ChevronRightIcon className="size-3.5" />
              </BreadcrumbSeparator>
            </>
          )}
          <BreadcrumbItem className="min-w-0 flex-1">
            <BreadcrumbPage className="block min-w-0 truncate">{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <ResponsiveTitle title={title} mobileTitle={mobileTitle} />
    </div>
  );
}
