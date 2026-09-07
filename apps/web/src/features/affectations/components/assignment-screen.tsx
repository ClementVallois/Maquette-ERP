import { useNavigate } from '@tanstack/react-router';
import { CalendarRangeIcon, PencilIcon, PlusIcon } from 'lucide-react';
import type { ReactElement, SyntheticEvent } from 'react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { GlossaryTerm } from '@/components/glossary-term';
import { SingleSelectCombobox } from '@/components/single-select-combobox';
import { StatCard } from '@/components/stat-card';
import { TogglePillGroup } from '@/components/toggle-pill-group';
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

import { assignmentFormRefusal } from '../form';
import { useAssignments, useSaveAssignment } from '../hooks';
import { INTERCONTRAT_MISSION_NAME, type Assignment, type AssignmentInput } from '../types';

type ViewFilter = 'current' | 'upcoming' | 'ended' | 'all';
type StaffingFilter = 'on-mission' | 'intercontrat';

const VIEW_ORDER: readonly ViewFilter[] = ['current', 'upcoming', 'ended', 'all'];

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

/** Neither current nor upcoming — the third of the three mutually-exclusive, exhaustive buckets
 * `all`'s count has to sum from. */
function isEnded(assignment: Assignment, today: string): boolean {
  return !isCurrent(assignment, today) && !isUpcoming(assignment, today);
}

/**
 * The client-side twin of `managerStaffingSnapshot`
 * (`apps/api/src/staffing/staffing-snapshot.ts`): a consultant with any assignment active today
 * whose mission is not `Intercontrat` is `'on-mission'`, even if they also hold an `Intercontrat`
 * row today — staffed on real work takes precedence. A consultant with no assignment active today
 * is in neither bucket (`null`), never naively read off assignment rows alone.
 */
function staffingBucketOf(
  assignments: readonly Assignment[],
  consultantId: string,
  today: string,
): StaffingFilter | null {
  const active = assignments.filter(
    (assignment) => assignment.consultantId === consultantId && isCurrent(assignment, today),
  );
  if (active.length === 0) return null;

  return active.some((assignment) => assignment.missionName !== INTERCONTRAT_MISSION_NAME)
    ? 'on-mission'
    : 'intercontrat';
}

interface AssignmentScreenProps {
  readonly view: ViewFilter;
  readonly staffing?: StaffingFilter;
}

export function AssignmentScreen({ view, staffing }: AssignmentScreenProps): ReactElement {
  const query = useAssignments();
  const save = useSaveAssignment();
  const navigate = useNavigate();
  const [form, setForm] = useState<AssignmentInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  // No native `<select required>` backs the consultant or mission pickers any more (both a
  // `Button`+`Popover` pair, `single-select-combobox.tsx`) — this is what replaces the browser's
  // own "please fill this field" gate, since without it "Affecter" would otherwise silently do
  // nothing when the rest of the form is filled but one of the two is not chosen.
  const [consultantMissing, setConsultantMissing] = useState(false);
  const [missionMissing, setMissionMissing] = useState(false);
  const formHeading = useRef<HTMLHeadingElement>(null);

  function setView(next: ViewFilter): void {
    void navigate({ to: '/affectations', search: (prev) => ({ ...prev, view: next }) });
  }

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
  const ended = data.assignments.filter((assignment) => isEnded(assignment, data.today));
  const byStatus =
    view === 'current'
      ? current
      : view === 'upcoming'
        ? upcoming
        : view === 'ended'
          ? ended
          : data.assignments;
  // Item 3, QA round 6: the manager dashboard's staffing chart deep-links here with a consultant
  // bucket, not an assignment property — `staffingBucketOf` replicates the server's own
  // per-consultant precedence (`managerStaffingSnapshot`) rather than filtering rows by mission
  // name, which would diverge from it (a consultant on-mission but with an idle `Intercontrat`
  // row would otherwise count twice, once in each bucket).
  const staffingConsultantIds =
    staffing === undefined
      ? null
      : new Set(
          data.consultants
            .filter((consultant) => consultant.departureDate === null)
            .filter(
              (consultant) =>
                staffingBucketOf(data.assignments, consultant.id, data.today) === staffing,
            )
            .map((consultant) => consultant.id),
        );
  const visible =
    staffingConsultantIds === null
      ? byStatus
      : byStatus
          .filter((assignment) => staffingConsultantIds.has(assignment.consultantId))
          .filter(
            (assignment) =>
              staffing !== 'on-mission' || assignment.missionName !== INTERCONTRAT_MISSION_NAME,
          );
  const selectedMission = data.missions.find((mission) => mission.id === form.missionId);
  const selectedConsultant = data.consultants.find(
    (consultant) => consultant.id === form.consultantId,
  );
  // ADR-0079: a departed consultant (Marine) never appears in a current roster read — the same
  // filter `matchingConsultants` applied before the search box and native `<select>` this
  // combobox replaces existed at all.
  const consultantOptions = data.consultants
    .filter((consultant) => consultant.departureDate === null)
    .map((consultant) => ({ value: consultant.id, label: consultant.name }));
  // No departed-consultant analogue here: `data.missions` is offered unfiltered.
  const missionOptions = data.missions.map((mission) => ({
    value: mission.id,
    label: `${mission.clientName} — ${mission.name}`,
  }));
  const mutationProblem = save.error instanceof ApiProblemError ? save.error.problem : null;

  const startEditing = (assignment: Assignment): void => {
    save.reset();
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
    setForm(EMPTY_FORM);
    setConsultantMissing(false);
    setMissionMissing(false);
    save.reset();
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const refusal = assignmentFormRefusal(form);
    if (refusal === 'consultant') {
      setConsultantMissing(true);
      document.getElementById('assignment-consultant')?.focus();
      return;
    }
    if (refusal === 'mission') {
      setMissionMissing(true);
      document.getElementById('assignment-mission')?.focus();
      return;
    }
    if (refusal !== null) return;
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
                    <Label htmlFor="assignment-consultant">{LABELS.assignment.consultant}</Label>
                    <SingleSelectCombobox
                      id="assignment-consultant"
                      label={LABELS.assignment.consultant}
                      searchLabel={LABELS.assignment.searchConsultant}
                      searchPlaceholder={LABELS.assignment.searchPlaceholder}
                      noneSelectedLabel={LABELS.assignment.chooseConsultant}
                      noMatchLabel={LABELS.assignment.noSearchResults}
                      clearLabel={LABELS.assignment.clearConsultant}
                      options={consultantOptions}
                      value={form.consultantId}
                      onChange={(next) => {
                        setForm({ ...form, consultantId: next });
                        setConsultantMissing(false);
                      }}
                      className="h-11 w-full"
                      invalid={consultantMissing}
                      {...(consultantMissing
                        ? { describedById: 'assignment-consultant-error' }
                        : {})}
                    />
                    {consultantMissing && (
                      <p
                        id="assignment-consultant-error"
                        role="alert"
                        className="text-sm text-destructive"
                      >
                        {LABELS.assignment.consultantRequired}
                      </p>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col gap-2">
                    <Label htmlFor="assignment-mission">{LABELS.assignment.mission}</Label>
                    <SingleSelectCombobox
                      id="assignment-mission"
                      label={LABELS.assignment.mission}
                      searchLabel={LABELS.assignment.searchMission}
                      searchPlaceholder={LABELS.assignment.missionSearchPlaceholder}
                      noneSelectedLabel={LABELS.assignment.chooseMission}
                      noMatchLabel={LABELS.assignment.noMissionSearchResults}
                      clearLabel={LABELS.assignment.clearMission}
                      options={missionOptions}
                      value={form.missionId}
                      onChange={(next) => {
                        setForm({ ...form, missionId: next });
                        setMissionMissing(false);
                      }}
                      className="h-11 w-full"
                      invalid={missionMissing}
                      {...(missionMissing ? { describedById: 'assignment-mission-error' } : {})}
                    />
                    {missionMissing && (
                      <p
                        id="assignment-mission-error"
                        role="alert"
                        className="text-sm text-destructive"
                      >
                        {LABELS.assignment.missionRequired}
                      </p>
                    )}
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
          <TogglePillGroup
            label={LABELS.assignment.filterGroupLabel}
            exclusive
            options={VIEW_ORDER.map((value) => ({
              value,
              label: LABELS.assignment.filters[value],
              count:
                value === 'current'
                  ? current.length
                  : value === 'upcoming'
                    ? upcoming.length
                    : value === 'ended'
                      ? ended.length
                      : data.assignments.length,
            }))}
            selected={[view]}
            onChange={([next]) => {
              setView(next === undefined ? 'current' : (next as ViewFilter));
            }}
          />
        </div>

        {staffingConsultantIds !== null && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 px-4 py-2.5 text-sm">
            <span>
              {staffing === 'on-mission'
                ? LABELS.assignment.staffingFilterOnMission
                : LABELS.assignment.staffingFilterIntercontrat}
              {' · '}
              {LABELS.assignment.staffingFilterCount.replace(
                '{count}',
                String(staffingConsultantIds.size),
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void navigate({ to: '/affectations', search: { view: 'current' } })}
            >
              {LABELS.assignment.staffingFilterClear}
            </Button>
          </div>
        )}

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
