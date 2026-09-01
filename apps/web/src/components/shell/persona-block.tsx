import { useNavigate } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';

import { RoleBadge } from '@/components/role-badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useClearPersona } from '@/features/session/hooks';
import type { PersonaSummary } from '@/features/session/types';
import { LABELS } from '@/lib/labels';

function initialsOf(displayName: string): string {
  const words = displayName.trim().split(/\s+/u);
  const first = words[0]?.charAt(0) ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? '') : '';

  return `${first}${last}`.toUpperCase();
}

/**
 * The topbar's right-hand identity block (direction-visuelle.md §6, frontend-plan.md task 4.2):
 * name, role, office, and "Changer de persona" (→ `DELETE /api/v1/session/persona` →
 * redirect `/`). Initials only, never a stock photo (direction-visuelle.md §1: "There are no
 * users — there are four personas … Personas get initials, never a stock face").
 */
export function PersonaBlock({ persona }: { readonly persona: PersonaSummary }): ReactElement {
  const clearPersona = useClearPersona();
  const navigate = useNavigate();

  const handleChange = (): void => {
    clearPersona.mutate(undefined, {
      onSuccess: () => {
        void navigate({ to: '/' });
      },
      onError: () => {
        toast.error(LABELS.shell.unexpectedErrorBody);
      },
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          // Item 1 (QA round 2): the topbar is a fixed 56px (`h-14`, direction-visuelle.md §6) and
          // this button's own content — two text lines, the second one carrying `RoleBadge`'s own
          // box height — already filled it edge to edge with the old `py-1.5`, so its border sat
          // flush on the topbar's own border. Trading `py-1.5` for `py-[3px]` plus a new
          // `my-[3px]` opens real clearance from the bar without touching the 56px constant
          // everything else in the topbar is built against, measured at ~3px top and bottom
          // against the current content height — not an enforced invariant: if `RoleBadge`'s own
          // box ever grows, this button grows with it and the margin is what gives, unguarded.
          className="my-[3px] flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-[3px] text-left transition-colors duration-120 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Avatar size="sm">
            <AvatarFallback>{initialsOf(persona.displayName)}</AvatarFallback>
          </Avatar>
          <span className="flex flex-col items-start gap-0.5 leading-tight">
            <span className="text-sm font-medium text-foreground">{persona.displayName}</span>
            {/* Item 4, QA round 1: the role reads as a coloured badge (ADR-0076) rather than
                plain text — the middle dot direction-visuelle.md §6's ASCII sketch describes
                (`manager·Paris`) stays between the badge and the office name. */}
            <span className="flex items-center gap-1 text-[0.75rem] text-muted-foreground">
              <RoleBadge role={persona.role} /> · {persona.office}
            </span>
          </span>
          <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{LABELS.persona.current}</DropdownMenuLabel>
        <div className="flex flex-col gap-1 px-1.5 pb-1.5 text-sm text-muted-foreground">
          <p className="flex items-center gap-1.5">
            {LABELS.persona.role} : <RoleBadge role={persona.role} />
          </p>
          <p>
            {LABELS.persona.office} : {persona.office}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={handleChange}>{LABELS.persona.change}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
