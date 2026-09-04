import { Link } from '@tanstack/react-router';
import { ShieldAlertIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { RoleBadge } from '@/components/role-badge';
import { Button } from '@/components/ui/button';
import type { Role } from '@/features/session/types';
import { LABELS } from '@/lib/labels';

interface DeniedStateProps {
  /** The rule that refused, `problem.deniedBy` — never a status code (direction-visuelle.md §7). */
  readonly deniedBy: string;
  readonly role: Role;
}

/**
 * direction-visuelle.md §7's "Denied" shape: the same frame as `ErrorState`, but it **names the
 * rule and the persona's role**, and its tone is "a demonstration rather than an apology — it is
 * the screen the repository is proudest of, and it is styled like a result, not like a crash."
 *
 * First real caller: task 6.5's 403 on `/cra/$period` (a manager or billing persona hits
 * `insufficient-role` — the route is `forRoles('consultant')` and the path carries no consultant
 * id, so `out-of-scope` cannot be produced from this route; see `docs/open-questions.md`, row
 * dated 25/08/2026, for why the filename says "out-of-scope" while the reachable refusal here is
 * `insufficient-role` — both classify to the same `{ kind: 'denied' }` this component renders).
 */
export function DeniedState({ deniedBy, role }: DeniedStateProps): ReactElement {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-xl bg-card p-8 text-center shadow-card ring-1 ring-border">
      <span className="flex size-10 items-center justify-center rounded-full bg-destructive/10">
        <ShieldAlertIcon aria-hidden="true" className="size-5 text-destructive" />
      </span>
      <h1 className="text-card-title">{LABELS.problem.heading.denied}</h1>
      {/* Stacked (label above value), not side-by-side: this card is capped at `max-w-md`
          regardless of viewport, and a domain `problemType` path (`/problems/assignment-
          missing-habilitation`, the longest one this repo has) does not fit next to its own
          label in that width on any screen — a `justify-between` row here wraps both halves
          independently and staggers them, not just on narrow viewports. */}
      <dl className="flex w-full flex-col gap-3 text-sm">
        <div className="flex flex-col items-center gap-0.5">
          <dt className="text-muted-foreground">{LABELS.problem.deniedBy}</dt>
          <dd className="max-w-full font-mono text-[0.8125rem] break-words text-foreground">
            {deniedBy}
          </dd>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <dt className="text-muted-foreground">{LABELS.persona.role}</dt>
          <dd>
            <RoleBadge role={role} />
          </dd>
        </div>
      </dl>
      <Button asChild size="sm" className="mt-1">
        <Link to="/tableau-de-bord">{LABELS.shell.breadcrumbHome}</Link>
      </Button>
    </div>
  );
}
