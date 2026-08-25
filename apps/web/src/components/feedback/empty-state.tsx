import { Link } from '@tanstack/react-router';
import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';

/**
 * direction-visuelle.md §7's "Empty" shape, built once here rather than improvised per screen:
 * centred in the card, a 20px icon in `--muted-foreground` on a `--muted` disc, a one-line title
 * at body weight 600, one line of help text, and — only when the caller passes one — one action.
 * Never an illustration.
 *
 * Phase 4 uses this for the persona grid's empty case (4.1) and, with a different icon and copy,
 * for every "à venir" placeholder the nav can reach ahead of its own phase (4.3) — the two are the
 * same visual shape (icon, one-line title, one line of help text, no illustration), so one
 * component serves both rather than a `ComingSoon` twin that would only restate this file.
 */
interface EmptyStateProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  readonly action?: { readonly label: string; readonly to: string };
}

export function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps): ReactElement {
  return (
    <div className="flex w-full flex-col items-center gap-3 rounded-xl bg-card p-10 text-center shadow-card ring-1 ring-border">
      <span className="flex size-10 items-center justify-center rounded-full bg-muted">
        <Icon aria-hidden="true" className="size-5 text-muted-foreground" />
      </span>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action !== undefined && (
        <Button asChild variant="outline" size="sm" className="mt-1">
          <Link to={action.to}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
