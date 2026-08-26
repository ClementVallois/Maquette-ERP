import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * shadcn's `Textarea`, added in Phase 7 for the refusal dialog's motif field (task 7.3) — the
 * kit's own generator emits exactly this file for `npx shadcn add textarea`; copied by hand here
 * since Phase 7 does not otherwise touch the CLI. No new dependency: same Tailwind tokens as
 * `input.tsx`, no package this repository does not already carry.
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content min-h-16 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40',
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
