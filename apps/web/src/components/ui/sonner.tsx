import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import type { CSSProperties } from 'react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

// The generated component reads `next-themes` to switch `light`/`dark` — this app has one theme
// (direction-visuelle.md §10, no `.dark` block in styles/globals.css) and does not depend on
// Next.js at all (it is a Vite SPA, BUILD-RULES' stack table), so that import was dead on arrival
// and `theme` is fixed to `'light'` instead of read from a provider that does not exist here.
// Sonner reads its own CSS custom properties, which React's `CSSProperties` does not declare
// (`--normal-bg` is not a known property). `objectLiteralTypeAssertions: 'never'`
// (eslint.config.js) refuses `{...} as CSSProperties` on the literal itself, so the literal is
// typed as a plain string record and only the reference passed to `style` is cast, below.
const toastVariables: Record<string, string> = {
  '--normal-bg': 'var(--popover)',
  '--normal-text': 'var(--popover-foreground)',
  '--normal-border': 'var(--border)',
  '--border-radius': 'var(--radius-xl)',
};
const toastStyle = toastVariables as CSSProperties;

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={toastStyle}
      {...props}
    />
  );
}

export { Toaster };
