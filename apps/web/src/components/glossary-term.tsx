import { CircleHelpIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { LABELS } from '@/lib/labels';

export type GlossaryTermKey =
  'cra' | 'tjm' | 'cjm' | 'regie' | 'forfait' | 'preFacturier' | 'habilitation' | 'intercontrat';

export function GlossaryTerm({ term }: { readonly term: GlossaryTermKey }): ReactElement {
  const entry = LABELS.glossary[term];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 border-b border-dotted border-current font-medium text-inherit hover:text-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={LABELS.glossary.open.replace('{term}', entry.label)}
        >
          {entry.label}
          <CircleHelpIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <PopoverTitle>{entry.label}</PopoverTitle>
        <PopoverDescription>{entry.definition}</PopoverDescription>
      </PopoverContent>
    </Popover>
  );
}
