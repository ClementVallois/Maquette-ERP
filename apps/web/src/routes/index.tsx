import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { UsersIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePersonas, useSelectPersona } from '@/features/session/hooks';
import type { PersonaSummary } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { LABELS } from '@/lib/labels';
import { headingFor, sentenceFor } from '@/lib/problems';

/**
 * `/` — the persona selector (frontend-plan.md task 4.1). "C'est le premier écran de la démo :
 * niveau de finition maximal." Not authentication, and the notice returned by the API in `notice`
 * says so in place, above the grid — never softened, never called a login.
 */
export const Route = createFileRoute('/')({
  component: PersonaSelectorPage,
});

function PersonaSelectorPage(): ReactElement {
  const personas = usePersonas();
  const selectPersona = useSelectPersona();
  const navigate = useNavigate();

  const choose = (persona: PersonaSummary): void => {
    selectPersona.mutate(persona.key, {
      onSuccess: () => {
        void navigate({ to: '/tableau-de-bord' });
      },
      onError: () => {
        toast.error(LABELS.persona.selectError);
      },
    });
  };

  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-dvh max-w-[760px] flex-col justify-center gap-8 px-6 py-16"
    >
      <header className="flex flex-col gap-3 text-center">
        <p className="text-sm font-semibold tracking-wide text-primary uppercase">
          {LABELS.appName}
        </p>
        <h1 className="text-page-title">{LABELS.persona.heading}</h1>
        <p className="text-sm text-muted-foreground">{LABELS.persona.lead}</p>
      </header>

      {/* The API's own `notice` field, not the copy deck's paraphrase of it (frontend-plan.md
          task 4.1: "La notice … (renvoyée par l'API dans notice) est affichée en évidence") —
          `LABELS.persona.warning` says the same thing and stays as the lead's supporting line
          above; this banner is what actually renders the server's own words. */}
      {personas.data !== undefined && (
        <div className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
          {personas.data.notice}
        </div>
      )}

      {personas.isPending && <PersonaGridSkeleton />}

      {personas.isError && (
        <ErrorState
          title={
            personas.error instanceof ApiProblemError
              ? headingFor(personas.error.problem)
              : LABELS.problem.heading.internal
          }
          body={
            personas.error instanceof ApiProblemError
              ? sentenceFor(personas.error.problem)
              : LABELS.shell.unexpectedErrorBody
          }
          {...(personas.error instanceof ApiProblemError &&
          personas.error.problem.correlationId !== undefined
            ? { correlationId: personas.error.problem.correlationId }
            : {})}
        />
      )}

      {personas.isSuccess && personas.data.personas.length === 0 && (
        <EmptyState
          icon={UsersIcon}
          title={LABELS.persona.emptyTitle}
          body={LABELS.persona.emptyBody}
        />
      )}

      {personas.isSuccess && personas.data.personas.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {personas.data.personas.map((persona) => (
            <PersonaCard
              key={persona.key}
              persona={persona}
              pending={selectPersona.isPending && selectPersona.variables === persona.key}
              disabled={selectPersona.isPending}
              onChoose={choose}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function PersonaGridSkeleton(): ReactElement {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-hidden="true">
      {[0, 1, 2, 3].map((index) => (
        <li key={index} className="rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
          <Skeleton className="mb-2 h-4 w-32" />
          <Skeleton className="h-3 w-20" />
        </li>
      ))}
    </ul>
  );
}

interface PersonaCardProps {
  readonly persona: PersonaSummary;
  readonly pending: boolean;
  readonly disabled: boolean;
  readonly onChoose: (persona: PersonaSummary) => void;
}

function PersonaCard({ persona, pending, disabled, onChoose }: PersonaCardProps): ReactElement {
  return (
    <li data-persona-key={persona.key}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          onChoose(persona);
        }}
        className="flex w-full flex-col items-start gap-2 rounded-xl bg-card p-5 text-left shadow-card ring-1 ring-border transition-colors duration-120 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className="text-card-title">{persona.displayName}</span>
        <span className="flex items-center gap-1.5">
          {/* Primary tint, deliberately not the neutral-outlined treatment every other role
              badge in the app uses (direction-visuelle.md §4.5: "On the selector … the role
              badge takes the primary tint … Everywhere else it is neutral outlined"). */}
          <Badge className="border-transparent bg-accent text-accent-foreground">
            {LABELS.roles[persona.role]}
          </Badge>
          <span className="text-sm text-muted-foreground">{persona.office}</span>
        </span>
        <span className="text-sm text-primary">{pending ? '…' : LABELS.persona.choose}</span>
      </button>
    </li>
  );
}
