import { EyeIcon, EyeOffIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';

interface VisibilityToggleProps {
  readonly visible: boolean;
  readonly onToggle: () => void;
  /** The accessible name for the action, not the current state — "Masquer"/"Afficher" rather
   * than "Visible"/"Masqué", the same convention `routes/_shell.tsx`'s own collapse toggle
   * follows (`shell.collapse`/`shell.expand`). */
  readonly hideLabel: string;
  readonly showLabel: string;
}

/**
 * Items 17/23, QA round 3: the eye/eye-off collapsible affordance shared by the dashboard's
 * company-news module and its charts area — one small component rather than two copies of the
 * same icon-swap button. Owns nothing about *what* is shown or hidden or how that choice
 * persists: each caller keeps its own `visible` state and its own `localStorage` read/write
 * (`lib/local-preference.ts`), scoped by persona key — this component is the button alone.
 */
export function VisibilityToggle({
  visible,
  onToggle,
  hideLabel,
  showLabel,
}: VisibilityToggleProps): ReactElement {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={onToggle}
      aria-label={visible ? hideLabel : showLabel}
    >
      {visible ? <EyeIcon aria-hidden="true" /> : <EyeOffIcon aria-hidden="true" />}
    </Button>
  );
}
