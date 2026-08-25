import { Link } from '@tanstack/react-router';
import { ShieldAlertIcon } from 'lucide-react';
import type { ReactElement } from 'react';

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
      <dl className="flex w-full flex-col gap-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{LABELS.problem.deniedBy}</dt>
          <dd className="font-mono text-[0.8125rem] text-foreground">{deniedBy}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{LABELS.persona.role}</dt>
          <dd className="text-foreground">{LABELS.roles[role]}</dd>
        </div>
      </dl>
      <Button asChild size="sm" className="mt-1">
        <Link to="/tableau-de-bord">{LABELS.shell.breadcrumbHome}</Link>
      </Button>
    </div>
  );
}
