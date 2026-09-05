import { CalendarRangeIcon, PencilIcon, PlusIcon } from 'lucide-react';
import type { ReactElement, SyntheticEvent } from 'react';
import { useRef, useState } from 'react';
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
  const [consultantSearch, setConsultantSearch] = useState('');
  const formHeading = useRef<HTMLHeadingElement>(null);
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
  const selectedConsultant = data.consultants.find(
    (consultant) => consultant.id === form.consultantId,
  );
  const normalize = (value: string): string =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/gu, '')
      .toLocaleLowerCase('fr-FR')
      .trim();
  const matchingConsultants = data.consultants.filter(
    (consultant) =>
      consultant.departureDate === null &&
      normalize(consultant.name).includes(normalize(consultantSearch)),
  );
  const mutationProblem = save.error instanceof ApiProblemError ? save.error.problem : null;

  const startEditing = (assignment: Assignment): void => {
    save.reset();
    setConsultantSearch('');
    setEditingId(assignment.id);
    formHeading.current?.scrollIntoView({ block: 'start' });
    formHeading.current?.focus({ preventScroll: true });
    setForm({
      consultantId: assignment.consultantId,
      missionId: assignment.missionId,
      fromDate: assignment.fromDate,
      toDate: assignment.toDate,
    });
  };

  const resetForm = (): void => {
    setEditingId(null);
    setConsultantSearch('');
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
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <StatCard
          className="justify-between p-3 sm:p-5"
          label={LABELS.assignment.current}
          value={String(current.length)}
        />
        <StatCard
          className="justify-between p-3 sm:p-5"
          label={LABELS.assignment.upcoming}
          value={String(upcoming.length)}
        />
        <StatCard
          className="justify-between p-3 sm:p-5"
          label={LABELS.assignment.consultants}
          value={String(data.consultants.length)}
        />
      </div>

      <section className="rounded-xl bg-card p-4 shadow-card ring-1 ring-border sm:p-6">
        <div className="mb-5 border-b border-border pb-4">
          <h2 ref={formHeading} tabIndex={-1} className="scroll-mt-4 text-card-title outline-none">
            {editingId === null ? LABELS.assignment.new : LABELS.assignment.edit}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            {LABELS.assignment.formLead}
          </p>
        </div>
        <form
          className="flex min-w-0 flex-col gap-5"
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <fieldset
            disabled={save.isPending}
            className="grid min-w-0 gap-5 lg:grid-cols-2 lg:gap-8"
          >
            <div className="flex min-w-0 flex-col gap-4">
              <h3 className="text-sm font-semibold">{LABELS.assignment.selection}</h3>
              {editingId === null ? (
                <>
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="assignment-search">{LABELS.assignment.searchConsultant}</Label>
                    <Input
                      id="assignment-search"
                      type="search"
                      className="h-11"
                      value={consultantSearch}
                      placeholder={LABELS.assignment.searchPlaceholder}
                      onChange={(event) => {
                        setConsultantSearch(event.target.value);
                      }}
                    />
                    <Label htmlFor="assignment-consultant">{LABELS.assignment.consultant}</Label>
                    <select
                      id="assignment-consultant"
                      className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-base md:text-sm"
                      value={form.consultantId}
                      required
                      onChange={(event) => {
                        setForm({ ...form, consultantId: event.target.value });
                      }}
                    >
                      <option value="">{LABELS.assignment.chooseConsultant}</option>
                      {selectedConsultant !== undefined &&
                        !matchingConsultants.some(
                          (consultant) => consultant.id === selectedConsultant.id,
                        ) && (
                          <option value={selectedConsultant.id}>{selectedConsultant.name}</option>
                        )}
                      {matchingConsultants.map((consultant) => (
                        <option key={consultant.id} value={consultant.id}>
                          {consultant.name}
                        </option>
                      ))}
                    </select>
                    {matchingConsultants.length === 0 && (
                      <p role="status" className="text-sm text-muted-foreground">
                        {LABELS.assignment.noSearchResults}
                      </p>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="assignment-mission">{LABELS.assignment.mission}</Label>
                    <select
                      id="assignment-mission"
                      className="h-11 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-base md:text-sm"
                      value={form.missionId}
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
                </>
              ) : (
                <dl className="flex flex-col gap-3 rounded-lg bg-muted p-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">{LABELS.assignment.consultant}</dt>
                    <dd className="mt-1 font-medium">{selectedConsultant?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">{LABELS.assignment.mission}</dt>
                    <dd className="mt-1 font-medium">
                      {selectedMission?.clientName} — {selectedMission?.name}
                    </dd>
                  </div>
                </dl>
              )}
              {selectedMission !== undefined && (
                <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">
                    {selectedMission.clientName} — {selectedMission.name}
                  </p>
                  <p className="mt-2">
                    {LABELS.assignment.missionDates} : {frenchDate(selectedMission.startDate)} ·{' '}
                    {selectedMission.endDate === null
                      ? LABELS.assignment.openEnded
                      : frenchDate(selectedMission.endDate)}
                  </p>
                  <div className="mt-2">
                    <GlossaryTerm term="habilitation" />
                  </div>
                  <p className="mt-1">
                    {selectedMission.requiredHabilitations.length === 0
                      ? LABELS.assignment.noHabilitation
                      : LABELS.assignment.requiredHabilitations.replace(
                          '{names}',
                          selectedMission.requiredHabilitations.join(', '),
                        )}
                  </p>
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-4 lg:border-l lg:border-border lg:pl-8">
              <h3 className="text-sm font-semibold">{LABELS.assignment.dates}</h3>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="assignment-from">{LABELS.assignment.from}</Label>
                  <Input
                    id="assignment-from"
                    type="date"
                    className="h-11"
                    value={form.fromDate}
                    required
                    onChange={(event) => {
                      setForm({ ...form, fromDate: event.target.value });
                    }}
                  />
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                  <Label htmlFor="assignment-to">{LABELS.assignment.to}</Label>
                  <Input
                    id="assignment-to"
                    type="date"
                    className="h-11"
                    value={form.toDate ?? ''}
                    min={form.fromDate || undefined}
                    aria-describedby="assignment-end-hint"
                    onChange={(event) => {
                      setForm({
                        ...form,
                        toDate: event.target.value === '' ? null : event.target.value,
                      });
                    }}
                  />
                </div>
              </div>
              <p id="assignment-end-hint" className="text-sm text-muted-foreground">
                {LABELS.assignment.endHint}
              </p>
            </div>
          </fieldset>
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            {editingId !== null && (
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                disabled={save.isPending}
                onClick={resetForm}
              >
                {LABELS.assignment.cancelEdit}
              </Button>
            )}
            <Button type="submit" className="min-h-11" pending={save.isPending}>
              {editingId === null ? <PlusIcon /> : <PencilIcon />}
              {editingId === null ? LABELS.assignment.create : LABELS.assignment.save}
            </Button>
          </div>
        </form>

        {mutationProblem !== null && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{sentenceFor(mutationProblem)}</AlertDescription>
          </Alert>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
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
