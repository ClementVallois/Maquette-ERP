import { useNavigate } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';

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
          className="flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 text-left transition-colors duration-120 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Avatar size="sm">
            <AvatarFallback>{initialsOf(persona.displayName)}</AvatarFallback>
          </Avatar>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-medium text-foreground">{persona.displayName}</span>
            {/* Thin spaces around the middle dot, the separator `apps/api/src/web/problem-page.ts`
                already uses (`' · '`) — direction-visuelle.md §6's ASCII sketch writes
                `manager·Paris` to fit a monospace box, not as a typographic instruction. */}
            <span className="text-[0.75rem] text-muted-foreground">
              {LABELS.roles[persona.role]} · {persona.office}
            </span>
          </span>
          <ChevronDownIcon aria-hidden="true" className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{LABELS.persona.current}</DropdownMenuLabel>
        <div className="px-1.5 pb-1.5 text-sm text-muted-foreground">
          <p>
            {LABELS.persona.role} : {LABELS.roles[persona.role]}
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
