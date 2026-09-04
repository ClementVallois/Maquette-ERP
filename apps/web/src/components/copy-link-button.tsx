import { CheckIcon, LinkIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

const COPIED_FEEDBACK_MS = 1500;

/**
 * O9: "copier le lien de cette vue". A screen's filters already live in its own URL search params
 * (TanStack Router writes them there on every change) — there is nothing to serialize here, this
 * copies `window.location.href` verbatim.
 *
 * `navigator.clipboard` is undefined on a non-secure origin (plain HTTP, no localhost exception on
 * some browsers) — guarded with try/catch rather than assumed, same reasoning as every other
 * clipboard call this codebase makes.
 *
 * Item 19, QA round 3: the button itself acknowledges the copy (icon swap, brief scale/colour
 * transition) on top of the existing toast — a toast alone is easy to miss when the pointer is
 * still on the button. The transition is plain CSS (`transition-*` classes), so it already
 * collapses to near-zero under `prefers-reduced-motion` via the global rule in `globals.css`; only
 * the state change (icon, colour) itself is what a reduced-motion user perceives.
 */
export function CopyLinkButton(): ReactElement {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    },
    [],
  );

  async function handleClick(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(LABELS.action.linkCopied);
      setCopied(true);
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        setCopied(false);
      }, COPIED_FEEDBACK_MS);
    } catch {
      toast.error(LABELS.action.linkCopyFailed);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        'transition-[transform,color,background-color,border-color] duration-200',
        copied &&
          'scale-105 border-status-cra-validated-dot bg-status-cra-validated-fill text-status-cra-validated-text',
      )}
      onClick={() => {
        void handleClick();
      }}
    >
      {copied ? <CheckIcon aria-hidden="true" /> : <LinkIcon aria-hidden="true" />}
      {LABELS.action.copyLink}
    </Button>
  );
}
