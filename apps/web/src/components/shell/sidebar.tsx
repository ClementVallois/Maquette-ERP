import { Link } from '@tanstack/react-router';
import { ChevronsLeftIcon, ChevronsRightIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { NavEntry } from '@/config/navigation';
import { LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

const EXPANDED_WIDTH = 'w-62'; // 248px (Tailwind's 4px scale: 62 * 4 = 248)
const COLLAPSED_WIDTH = 'w-16'; // 64px

interface SidebarProps {
  readonly entries: readonly NavEntry[];
  readonly collapsed: boolean;
  readonly onToggleCollapse: () => void;
}

/**
 * direction-visuelle.md §3.3/§6: near-black sidebar, 248px expanded / 64px collapsed
 * (icons + tooltips), active entry = fill + 3px left marker + white label. Reads `entries`
 * exclusively (frontend-plan.md task 4.3) — every branch below is about layout, never about which
 * entries exist for which role; that decision was already made by `navigationForRole`.
 */
export function Sidebar({ entries, collapsed, onToggleCollapse }: SidebarProps): ReactElement {
  return (
    <aside
      className={cn(
        // Hidden below `lg` (1024px), not Tailwind's `md` (768px): frontend-plan.md task 4.5 asks
        // for the mobile treatment "sous le breakpoint md", and `playwright.config.ts`'s own
        // secondary viewport for this check is 768 wide — Tailwind's `md:` is a `min-width: 768px`
        // query, so at exactly 768 it would already count as desktop and the two configured
        // viewports would never disagree. `lg` (1024px) is the literal breakpoint that keeps the
        // design intent (a narrower viewport gets the `Sheet`) distinguishable at both configured
        // widths — `components/shell/topbar.tsx`'s trigger button uses the matching `lg:hidden`.
        'hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-180 ease-out lg:flex motion-reduce:transition-none',
        collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH,
      )}
    >
      <div className="flex h-14 items-center justify-between gap-2 border-b border-sidebar-border px-3">
        {!collapsed && (
          <span className="truncate text-sm font-semibold text-white">{LABELS.appName}</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onToggleCollapse}
          aria-label={collapsed ? LABELS.shell.expand : LABELS.shell.collapse}
          className="ml-auto text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
        >
          {collapsed ? <ChevronsRightIcon /> : <ChevronsLeftIcon />}
        </Button>
      </div>

      <SidebarNavList entries={entries} collapsed={collapsed} />

      {/* Reserved, unpopulated (direction-visuelle.md §6): an empty zone is more honest than a
          control that opens nothing — no settings, no notification bell, nothing added here to
          fill the space. */}
      <div className="h-16 shrink-0 border-t border-sidebar-border" aria-hidden="true" />
    </aside>
  );
}

/**
 * The nav list alone, without the brand block, the collapse control or the reserved footer —
 * extracted so `components/shell/topbar.tsx`'s mobile `Sheet` (4.5: "sidebar en Sheet sous le
 * breakpoint md") can render the exact same config-driven links without duplicating them, and
 * without the icons-only affordance that only makes sense for the persistent, narrow aside.
 */
export function SidebarNavList({
  entries,
  collapsed,
}: {
  readonly entries: readonly NavEntry[];
  readonly collapsed: boolean;
}): ReactElement {
  return (
    <nav aria-label={LABELS.nav.main} className="flex flex-1 flex-col gap-0.5 p-2">
      {entries.map((entry) => (
        <SidebarLink key={entry.id} entry={entry} collapsed={collapsed} />
      ))}
    </nav>
  );
}

function SidebarLink({
  entry,
  collapsed,
}: {
  readonly entry: NavEntry;
  readonly collapsed: boolean;
}): ReactElement {
  const Icon = entry.icon;

  const link = (
    <Link
      to={entry.path}
      activeOptions={{ exact: false }}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-sidebar-foreground transition-colors duration-120 ease-out hover:bg-sidebar-accent hover:text-white focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:outline-none',
        'data-[status=active]:bg-sidebar-primary data-[status=active]:text-white',
        collapsed && 'justify-center',
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-0 hidden w-[3px] rounded-full bg-sidebar-active-marker group-data-[status=active]:block"
      />
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{entry.label}</span>}
      {collapsed && <span className="sr-only">{entry.label}</span>}
    </Link>
  );

  if (!collapsed) return link;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{entry.label}</TooltipContent>
    </Tooltip>
  );
}
