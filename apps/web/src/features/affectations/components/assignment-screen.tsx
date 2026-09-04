import { CalendarRangeIcon, PencilIcon, PlusIcon } from 'lucide-react';
import type { ReactElement, SyntheticEvent } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { GlossaryTerm } from '@/components/glossary-term';
import { StatCard } from '@/components/stat-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiProblemError } from '@/lib/api-client';
import { frenchDate } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { headingFor, sentenceFor } from '@/lib/problems';

import { useAssignments, useSaveAssignment } from '../hooks';
import type { Assignment, AssignmentInput } from '../types';

type ViewFilter = 'current' | 'all';

const EMPTY_FORM: AssignmentInput = {
  consultantId: '',
  missionId: '',
  fromDate: '',
  toDate: null,
};

function isCurrent(assignment: Assignment, today: string): boolean {
  return assignment.fromDate <= today && (assignment.toDate === null || assignment.toDate >= today);
}

function isUpcoming(assignment: Assignment, today: string): boolean {
  return assignment.fromDate > today;
}

export function AssignmentScreen(): ReactElement {
  const query = useAssignments();
  const save = useSaveAssignment();
  const [form, setForm] = useState<AssignmentInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ViewFilter>('current');

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-4" aria-hidden="true">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (query.isError) {
    const problem = query.error instanceof ApiProblemError ? query.error.problem : null;
    return (
      <ErrorState
        title={problem === null ? LABELS.problem.heading.internal : headingFor(problem)}
        body={problem === null ? LABELS.shell.unexpectedErrorBody : sentenceFor(problem)}
        onRetry={() => void query.refetch()}
        {...(problem?.correlationId === undefined ? {} : { correlationId: problem.correlationId })}
      />
    );
  }

  const data = query.data;
  const current = data.assignments.filter((assignment) => isCurrent(assignment, data.today));
  const upcoming = data.assignments.filter((assignment) => isUpcoming(assignment, data.today));
  const visible = filter === 'current' ? current : data.assignments;
  const selectedMission = data.missions.find((mission) => mission.id === form.missionId);
  const mutationProblem = save.error instanceof ApiProblemError ? save.error.problem : null;

  const startEditing = (assignment: Assignment): void => {
    setEditingId(assignment.id);
    setForm({
      consultantId: assignment.consultantId,
      missionId: assignment.missionId,
      fromDate: assignment.fromDate,
      toDate: assignment.toDate,
    });
  };

  const resetForm = (): void => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    save.reset();
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (form.consultantId === '' || form.missionId === '' || form.fromDate === '') return;
    try {
      await save.mutateAsync({ id: editingId, input: form });
      toast.success(
        editingId === null ? LABELS.assignment.createdToast : LABELS.assignment.updatedToast,
      );
      resetForm();
    } catch {
      // The typed refusal is rendered next to the form.
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={LABELS.assignment.current} value={String(current.length)} />
        <StatCard label={LABELS.assignment.upcoming} value={String(upcoming.length)} />
        <StatCard label={LABELS.assignment.consultants} value={String(data.consultants.length)} />
      </div>

      <section className="rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-card-title">
              {editingId === null ? LABELS.assignment.new : LABELS.assignment.edit}
            </h2>
            <p className="text-sm text-muted-foreground">{LABELS.assignment.formLead}</p>
          </div>
          {editingId !== null && (
            <Button type="button" variant="ghost" onClick={resetForm}>
              {LABELS.assignment.cancelEdit}
            </Button>
          )}
        </div>
        <form
          className="grid gap-4 lg:grid-cols-5 lg:items-end"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          {/* Item 34, QA round 3: `min-w-0` on the grid items, and `w-full min-w-0` on the two
              `<select>`s below. A grid track is `minmax(auto, 1fr)`, and a `<select>`'s auto
              minimum is the width of its widest `<option>` — "Banque Nationale de Test — Audit
              DORA" here. Below `lg` this form is one column, so that one option stretched the
              track to 466px inside a 351px page and the whole scrollport panned sideways. */}
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="assignment-consultant">{LABELS.assignment.consultant}</Label>
            <select
              id="assignment-consultant"
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm"
              value={form.consultantId}
              disabled={editingId !== null}
              required
              onChange={(event) => {
                setForm({ ...form, consultantId: event.target.value });
              }}
            >
              <option value="">{LABELS.assignment.chooseConsultant}</option>
              {data.consultants.map((consultant) => (
                <option
                  key={consultant.id}
                  value={consultant.id}
                  disabled={consultant.departureDate !== null}
                >
                  {consultant.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="assignment-mission">{LABELS.assignment.mission}</Label>
            <select
              id="assignment-mission"
              className="h-8 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm"
              value={form.missionId}
              disabled={editingId !== null}
              required
              onChange={(event) => {
                setForm({ ...form, missionId: event.target.value });
              }}
            >
              <option value="">{LABELS.assignment.chooseMission}</option>
              {data.missions.map((mission) => (
                <option key={mission.id} value={mission.id}>
                  {mission.clientName} — {mission.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="assignment-from">{LABELS.assignment.from}</Label>
            <Input
              id="assignment-from"
              type="date"
              value={form.fromDate}
              required
              onChange={(event) => {
                setForm({ ...form, fromDate: event.target.value });
              }}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor="assignment-to">{LABELS.assignment.to}</Label>
            <Input
              id="assignment-to"
              type="date"
              value={form.toDate ?? ''}
              onChange={(event) => {
                setForm({ ...form, toDate: event.target.value === '' ? null : event.target.value });
              }}
            />
          </div>
          <Button type="submit" disabled={save.isPending}>
            {editingId === null ? <PlusIcon /> : <PencilIcon />}
            {editingId === null ? LABELS.assignment.create : LABELS.assignment.save}
          </Button>
        </form>

        {selectedMission !== undefined && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <GlossaryTerm term="habilitation" />
            <p>
              {selectedMission.requiredHabilitations.length === 0
                ? LABELS.assignment.noHabilitation
                : LABELS.assignment.requiredHabilitations.replace(
                    '{names}',
                    selectedMission.requiredHabilitations.join(', '),
                  )}
            </p>
          </div>
        )}
        {mutationProblem !== null && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{sentenceFor(mutationProblem)}</AlertDescription>
          </Alert>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-card-title">{LABELS.assignment.list}</h2>
            <p className="text-sm text-muted-foreground">{LABELS.assignment.listLead}</p>
          </div>
          <div className="flex rounded-lg bg-muted p-1">
            {(['current', 'all'] as const).map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={filter === value ? 'secondary' : 'ghost'}
                onClick={() => {
                  setFilter(value);
                }}
              >
                {LABELS.assignment.filters[value]}
              </Button>
            ))}
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={CalendarRangeIcon}
            title={LABELS.assignment.empty}
            body={LABELS.assignment.emptyBody}
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {visible.map((assignment) => (
              <article
                key={assignment.id}
                className="flex items-start justify-between gap-4 rounded-xl bg-card p-4 shadow-card ring-1 ring-border"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground">{assignment.consultantName}</h3>
                    <Badge variant="outline">
                      {isCurrent(assignment, data.today)
                        ? LABELS.assignment.currentBadge
                        : isUpcoming(assignment, data.today)
                          ? LABELS.assignment.upcomingBadge
                          : LABELS.assignment.endedBadge}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-foreground">
                    {assignment.clientName} · {assignment.missionName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {LABELS.assignment.from} {frenchDate(assignment.fromDate)} ·{' '}
                    {assignment.toDate === null
                      ? LABELS.assignment.openEnded
                      : `${LABELS.assignment.to.toLocaleLowerCase()} ${frenchDate(assignment.toDate)}`}
                  </p>
                </div>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={LABELS.assignment.editFor.replace(
                    '{name}',
                    assignment.consultantName,
                  )}
                  onClick={() => {
                    startEditing(assignment);
                  }}
                >
                  <PencilIcon />
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
