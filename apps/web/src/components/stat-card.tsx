import type { ReactElement, ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface StatCardProps {
  readonly label: ReactNode;
  /** Pre-formatted — `src/lib/format.ts` (Phase 3.4) is the only place a number becomes a string. */
  readonly value: string;
  readonly helpText?: string;
  readonly className?: string;
}

/**
 * One large number, one label, at most one line of sub-text (direction-visuelle.md §1, §6).
 * Deliberately not built on `components/ui/card.tsx`: that component's padding is driven by a
 * `--card-spacing` custom property fixed at two sizes (16px / 12px) for content cards, and a KPI
 * card needs the third size the design calls for (20px, §6) — simpler and more robust to own the
 * surface here than to fight a CSS-variable override across two files for one property.
 *
 * No invented delta ("+15 % vs last month" — direction-visuelle.md §1 refuses it, the seed holds
 * one period): this component has no `trend`/`delta` prop, so a screen literally cannot pass one.
 */
export function StatCard({ label, value, helpText, className }: StatCardProps): ReactElement {
  return (
    <div
      className={cn(
        // `ring-border`, not an opacity-derived `ring-foreground/10`: §3.1 gives card edges their
        // own token (`--border`), and deriving the same line from `--foreground` puts a second,
        // slightly different edge colour in the system for no gain.
        'flex flex-col gap-1 rounded-xl bg-card p-5 shadow-card ring-1 ring-border',
        className,
      )}
    >
      <span className="text-label">{label}</span>
      <span className="text-kpi-figure tabular-nums">{value}</span>
      {helpText !== undefined && <span className="text-help">{helpText}</span>}
    </div>
  );
}
