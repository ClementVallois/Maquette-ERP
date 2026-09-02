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
  /** Omitted on the dashboard itself — a breadcrumb back to the page you are already on is noise. */
  readonly showBreadcrumb: boolean;
  /** The one level between "Tableau de bord" and `title` — `/factures/$id`'s own "Factures" or
   * "Pré-facturier", so far the only screen reached from two different lists (A10). `undefined`
   * everywhere else: every other screen is a direct child of the dashboard. */
  readonly parent?: PageHeaderParentCrumb | undefined;
}

/**
 * The topbar's left-hand content (direction-visuelle.md §6): page title, and a breadcrumb back to
 * the dashboard when the route is not the dashboard itself. Extracted from `Topbar` as its own
 * component per `docs/frontend-plan.md` §3's tree (`components/shell/PageHeader`) — the piece a
 * later phase's page-local header (inside a card, not the topbar) can reuse without pulling in the
 * persona block that lives beside it in `Topbar`.
 */
export function PageHeader({ title, showBreadcrumb, parent }: PageHeaderProps): ReactElement {
  if (!showBreadcrumb) {
    return <h1 className="text-page-title truncate">{title}</h1>;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/tableau-de-bord">{LABELS.shell.breadcrumbHome}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRightIcon className="size-3.5" />
          </BreadcrumbSeparator>
          {parent !== undefined && (
            <>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <a href={parent.href}>{parent.label}</a>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator>
                <ChevronRightIcon className="size-3.5" />
              </BreadcrumbSeparator>
            </>
          )}
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-page-title truncate">{title}</h1>
    </div>
  );
}
