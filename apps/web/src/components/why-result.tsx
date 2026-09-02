import { InfoIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';

interface WhyResultProps {
  readonly trigger: string;
  readonly title: string;
  readonly children: ReactNode;
}

/**
 * O2 — "Pourquoi ce résultat ?" deterministic (formula, reference date, applied rule), read off
 * the composition that actually produces the number rather than restated from memory. One surface
 * built (the marge screen): the plan itself notes this recoupe A3/A4 everywhere else, so this is
 * deliberately not a generic "explain any number" component reused screen-wide.
 */
export function WhyResult({ trigger, title, children }: WhyResultProps): ReactElement {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={trigger}
          className="text-muted-foreground"
        >
          <InfoIcon aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>{title}</PopoverTitle>
        </PopoverHeader>
        <ul className="flex flex-col gap-1.5 text-xs text-muted-foreground">{children}</ul>
      </PopoverContent>
    </Popover>
  );
}
