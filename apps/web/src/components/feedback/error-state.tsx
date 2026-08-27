import { Link } from '@tanstack/react-router';
import { OctagonAlertIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { type ActionLink, linkOf } from '@/components/action-link';
import { Button } from '@/components/ui/button';
import { LABELS } from '@/lib/labels';

/**
 * direction-visuelle.md §7's "Error" shape: a `--destructive` icon, the French sentence, and the
 * `correlationId` in monospace 0.75rem underneath. **The status code is never shown as a number**
 * — `title`/`body` are already the French heading and sentence a caller picked with
 * `headingFor`/`sentenceFor` (`lib/problems.ts`), never the raw `problem.status`.
 *
 * Used by `routes/__root.tsx`'s global error boundary (4.4) for both an `ApiProblemError` (with a
 * `correlationId`) and an unexpected JS error (without one, since no request produced it).
 */
interface ErrorStateProps {
  readonly title: string;
  readonly body: string;
  readonly correlationId?: string;
  readonly action?: ActionLink;
}

export function ErrorState({ title, body, correlationId, action }: ErrorStateProps): ReactElement {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl bg-card p-8 text-center shadow-card ring-1 ring-border">
      <OctagonAlertIcon aria-hidden="true" className="size-8 text-destructive" />
      <h1 className="text-card-title">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      {correlationId !== undefined && (
        <p className="font-mono text-[0.75rem] text-muted-foreground">
          {LABELS.problem.correlationId} : {correlationId}
        </p>
      )}
      {action !== undefined && (
        <Button asChild size="sm" className="mt-1">
          <Link {...linkOf(action)}>{action.label}</Link>
        </Button>
      )}
    </div>
  );
}
