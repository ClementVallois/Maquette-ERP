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

interface PageHeaderProps {
  readonly title: string;
  /** Omitted on the dashboard itself — a breadcrumb back to the page you are already on is noise. */
  readonly showBreadcrumb: boolean;
}

/**
 * The topbar's left-hand content (direction-visuelle.md §6): page title, and a breadcrumb back to
 * the dashboard when the route is not the dashboard itself. Extracted from `Topbar` as its own
 * component per `docs/frontend-plan.md` §3's tree (`components/shell/PageHeader`) — the piece a
 * later phase's page-local header (inside a card, not the topbar) can reuse without pulling in the
 * persona block that lives beside it in `Topbar`.
 */
export function PageHeader({ title, showBreadcrumb }: PageHeaderProps): ReactElement {
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
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-page-title truncate">{title}</h1>
    </div>
  );
}
