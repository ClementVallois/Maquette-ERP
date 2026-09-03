import { LinkIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { LABELS } from '@/lib/labels';

/**
 * O9: "copier le lien de cette vue". A screen's filters already live in its own URL search params
 * (TanStack Router writes them there on every change) — there is nothing to serialize here, this
 * copies `window.location.href` verbatim.
 *
 * `navigator.clipboard` is undefined on a non-secure origin (plain HTTP, no localhost exception on
 * some browsers) — guarded with try/catch rather than assumed, same reasoning as every other
 * clipboard call this codebase makes.
 */
export function CopyLinkButton(): ReactElement {
  async function handleClick(): Promise<void> {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(LABELS.action.linkCopied);
    } catch {
      toast.error(LABELS.action.linkCopyFailed);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void handleClick();
      }}
    >
      <LinkIcon aria-hidden="true" />
      {LABELS.action.copyLink}
    </Button>
  );
}
