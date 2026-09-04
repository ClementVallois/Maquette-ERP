import { Link } from '@tanstack/react-router';
import { CopyIcon, OctagonAlertIcon, RefreshCwIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';

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
 *
 * O11: the screen already named the right facts, it just had no way out. `onRetry` re-runs
 * whichever query produced the refusal (a caller passes its own `refetch`); `action` stays the one
 * `<Link>`-based navigation `routes/__root.tsx`'s global boundary uses, unchanged.
 */
interface ErrorStateProps {
  readonly title: string;
  readonly body: string;
  readonly correlationId?: string;
  readonly action?: ActionLink;
  readonly onRetry?: () => void;
}

export function ErrorState({
  title,
  body,
  correlationId,
  action,
  onRetry,
}: ErrorStateProps): ReactElement {
  async function copyCorrelationId(id: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(id);
      toast.success(LABELS.problem.correlationIdCopied);
    } catch {
      // Clipboard access can throw (non-secure origin, denied permission) — the id is still on
      // screen, selectable by hand, so there is nothing else to do here.
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl bg-card p-8 text-center shadow-card ring-1 ring-border">
      <OctagonAlertIcon aria-hidden="true" className="size-8 text-destructive" />
      <h1 className="text-card-title">{title}</h1>
      <p className="text-sm text-muted-foreground">{body}</p>
      {correlationId !== undefined && (
        // Not `flex`: a flex row keeps the copy button pinned to the row's end even once the id
        // wraps to a second or third line, leaving it visually orphaned next to nothing. `Button`
        // is `inline-flex` (an inline-level box on its own), so plain inline text flow lets it
        // wrap along with the id as a unit instead.
        <p className="max-w-full text-[0.75rem] text-muted-foreground">
          <span className="font-mono break-all">
            {LABELS.problem.correlationId} : {correlationId}
          </span>{' '}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={LABELS.problem.copyCorrelationId}
            className="align-middle"
            onClick={() => {
              void copyCorrelationId(correlationId);
            }}
          >
            <CopyIcon />
          </Button>
        </p>
      )}
      {(onRetry !== undefined || action !== undefined) && (
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {onRetry !== undefined && (
            <Button type="button" variant="outline" size="sm" onClick={onRetry}>
              <RefreshCwIcon aria-hidden="true" />
              {LABELS.problem.retry}
            </Button>
          )}
          {action !== undefined && (
            <Button asChild size="sm">
              <Link {...linkOf(action)}>{action.label}</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
