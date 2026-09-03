import { MenuIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { PageHeader, type PageHeaderParentCrumb } from '@/components/shell/page-header';
import { PersonaBlock } from '@/components/shell/persona-block';
import { SidebarNavList } from '@/components/shell/sidebar';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import type { NavEntry } from '@/config/navigation';
import type { PersonaSummary } from '@/features/session/types';
import { LABELS } from '@/lib/labels';

interface TopbarProps {
  readonly title: string;
  readonly showBreadcrumb: boolean;
  readonly parent?: PageHeaderParentCrumb | undefined;
  readonly entries: readonly NavEntry[];
  readonly persona: PersonaSummary;
}

/**
 * direction-visuelle.md §6: 56px, `--card` on a 1px `--border`, page title/breadcrumb left, the
 * persona block right. The strip beside the persona block is the topbar's own reserved zone
 * (§6: "it stays empty, because an empty reserved zone is more honest than a bell that does
 * nothing") — nothing is added there.
 */
export function Topbar({
  title,
  showBreadcrumb,
  parent,
  entries,
  persona,
}: TopbarProps): ReactElement {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card px-4">
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          aria-label={LABELS.shell.openMenu}
          onClick={() => {
            setMobileNavOpen(true);
          }}
        >
          <MenuIcon />
        </Button>
        <SheetContent side="left" className="w-62 bg-sidebar p-0 text-sidebar-foreground">
          <SheetHeader className="border-b border-sidebar-border">
            <SheetTitle className="text-white">{LABELS.appName}</SheetTitle>
            <SheetDescription className="sr-only">{LABELS.nav.main}</SheetDescription>
          </SheetHeader>
          {/* Closes the sheet on any nav click — `onClick` on the wrapper catches the bubbled
              click from whichever `Link` inside `SidebarNavList` the visitor pressed, without
              threading a callback through every entry. */}
          <div
            onClick={() => {
              setMobileNavOpen(false);
            }}
          >
            <SidebarNavList entries={entries} collapsed={false} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1">
        <PageHeader title={title} showBreadcrumb={showBreadcrumb} parent={parent} />
      </div>

      {/* The reserved strip: nothing renders here on purpose (direction-visuelle.md §6). */}
      <div className="hidden flex-1 lg:block" aria-hidden="true" />

      <PersonaBlock persona={persona} />
    </header>
  );
}
