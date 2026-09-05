import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { TriangleAlertIcon, UsersIcon } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';

import { DemoNotice } from '@/components/demo-notice';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { RoleBadge } from '@/components/role-badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { usePersonas, useSelectPersona } from '@/features/session/hooks';
import type { PersonaSummary } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { LABELS } from '@/lib/labels';
import { headingFor, sentenceFor } from '@/lib/problems';

const PersonaSelectorSearch = z.object({
  // The one value `features/session/session-guard.ts` sends (`SESSION_INVALIDATED_SEARCH`).
  // A literal rather than a free string: an unrecognised `?session=` must not be able to put words
  // on the demo's first screen, and `catch` keeps a hand-typed one from throwing at the visitor
  // instead of simply not applying.
  session: z.literal('invalidated').optional().catch(undefined),
});

export const Route = createFileRoute('/')({
  validateSearch: PersonaSelectorSearch,
  component: PersonaSelectorPage,
});

function PersonaSelectorPage(): ReactElement {
  const personas = usePersonas();
  const selectPersona = useSelectPersona();
  const navigate = useNavigate();
  const [choosing, setChoosing] = useState<string | null>(null);
  const { session } = Route.useSearch();

  const choose = async (persona: PersonaSummary): Promise<void> => {
    if (choosing !== null) return;
    setChoosing(persona.key);
    try {
      await selectPersona.mutateAsync(persona.key);
      await navigate({ to: '/tableau-de-bord' });
    } catch {
      toast.error(LABELS.persona.selectError);
    } finally {
      setChoosing(null);
    }
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
      </header>

      <DemoNotice />

      {/* Alert spreads props after its default role, so this explicit status role wins. ADR-0074. */}
      {session === 'invalidated' && (
        <Alert variant="destructive" role="status">
          <TriangleAlertIcon />
          <AlertTitle>{LABELS.persona.sessionInvalidatedTitle}</AlertTitle>
          <AlertDescription>{LABELS.shell.sessionInvalidated}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
        {LABELS.persona.notice}
      </div>

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
          onRetry={() => void personas.refetch()}
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
              pending={choosing === persona.key}
              disabled={choosing !== null}
              onChoose={(chosen) => {
                void choose(chosen);
              }}
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
        aria-busy={pending || undefined}
        onClick={() => {
          onChoose(persona);
        }}
        className="flex w-full flex-col items-start gap-2 rounded-xl bg-card p-5 text-left shadow-card ring-1 ring-border transition-colors duration-120 ease-out hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-progress"
      >
        <span className="text-card-title">{persona.displayName}</span>
        <span className="flex items-center gap-1.5">
          {/* Item 4, QA round 1: the same colour this role gets everywhere else in the app now
              (ADR-0076) — the selector no longer needs a distinct "primary tint" reading. */}
          <RoleBadge role={persona.role} />
          <span className="text-sm text-muted-foreground">{persona.office}</span>
        </span>
        <span className="text-sm text-primary">
          {pending ? LABELS.persona.loading : LABELS.persona.choose}
        </span>
      </button>
    </li>
  );
}
