import { HourglassIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { EmptyState } from '@/components/feedback/empty-state';
import { LABELS } from '@/lib/labels';

/**
 * frontend-plan.md task 4.3: "Les routes des phases 6-8 pointent provisoirement vers des pages
 * 'à venir' soignées" — every route `docs/frontend-plan.md` §3 pins that this phase does not build
 * a real screen for renders this, so a deep-link lands on a considered placeholder rather than a
 * blank `<div>` or a raw "TODO". No `<h1>` of its own: `components/shell/topbar.tsx`'s
 * `PageHeader` already renders the page's one heading, derived from the same nav entry this
 * placeholder stands in for — a second `<h1>` here would duplicate it.
 */
export function ComingSoon(): ReactElement {
  return (
    <EmptyState
      icon={HourglassIcon}
      title={LABELS.shell.comingSoonTitle}
      body={LABELS.shell.comingSoonBody}
    />
  );
}
