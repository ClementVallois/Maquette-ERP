import { Link, useNavigate } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { DataTable } from '@/components/data-table/data-table';
import { DeniedState } from '@/components/feedback/denied-state';
import { EmptyState } from '@/components/feedback/empty-state';
import { ErrorState } from '@/components/feedback/error-state';
import { MultiSelectCombobox } from '@/components/multi-select-combobox';
import { StatusBadge, type StatusBadgeVariant } from '@/components/status-badge';
import { TogglePillGroup } from '@/components/toggle-pill-group';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchDays, frenchMonth, frenchMonthName } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { currentPeriod } from '@/lib/period';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { useCalendar, useConsultantRoster, useCraList } from '../hooks';
import type { CraListItem, CraStatus } from '../types';

const CRA_STATUS_ORDER: readonly CraStatus[] = ['draft', 'submitted', 'validated', 'refused'];

const STATUS_VARIANT: Record<CraStatus, StatusBadgeVariant> = {
  draft: 'cra-draft',
  submitted: 'cra-submitted',
  validated: 'cra-validated',
  refused: 'cra-refused',
};

/** Item 4 (QA round 2): the "clear this filter" sentinel both `Select`s below need — Radix's
 * `SelectItem` refuses an empty string as a `value`. Shared between the year and month pickers on
 * purpose (each `Select`'s own item list is a separate Radix instance, so the one string cannot
 * collide with itself): never sent to the API or read from the URL, `CraListFilters.setYear`/
 * `setMonth` translate a click on either back to `undefined` before it ever reaches `navigate()`. */
const FILTER_ALL = 'all';
const MONTH_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/**
 * Item 2's own bound: "offer the months the calendar actually covers … derive that bound from the
 * calendar rather than hardcoding it." From the current wall-clock month through December of the
 * calendar's latest known year (`GET /api/v1/calendar`, ADR-0004) — never earlier, this is "the
 * months ahead" — minus whatever the list already carries a row (and therefore an "Ouvrir" button)
 * for.
 */
function offeredFutureMonths(
  years: readonly number[],
  alreadyListed: ReadonlySet<string>,
): string[] {
  if (years.length === 0) return [];
  const maxYear = Math.max(...years);
  const [startYearRaw, startMonthRaw] = currentPeriod().split('-');
  const startYear = Number.parseInt(startYearRaw ?? '0', 10);
  const startMonth = Number.parseInt(startMonthRaw ?? '1', 10);
  if (startYear > maxYear) return [];

  const months: string[] = [];
  for (let year = startYear; year <= maxYear; year += 1) {
    const firstMonth = year === startYear ? startMonth : 1;
    for (let month = firstMonth; month <= 12; month += 1) {
      const period = `${String(year)}-${String(month).padStart(2, '0')}`;
      if (!alreadyListed.has(period)) months.push(period);
    }
  }

  return months;
}

function ListSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

function columnsFor(role: Role): ColumnDef<CraListItem>[] {
  const columns: ColumnDef<CraListItem>[] = [];

  // ADR-0071: a manager's row needs a name to pick a consultant by. A consultant's own list is
  // always their own rows — a "Consultant" column repeating their own name would be noise.
  if (role === 'manager') {
    columns.push({
      id: 'consultantName',
      header: LABELS.cra.consultant,
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{row.original.consultantName}</span>
      ),
    });
  }

  columns.push(
    {
      id: 'period',
      header: LABELS.cra.period,
      accessorFn: (row) => row.period,
      cell: ({ row }) => (
        <span className="font-medium text-foreground">{frenchMonth(row.original.period)}</span>
      ),
    },
    {
      id: 'status',
      header: LABELS.cra.status,
      cell: ({ row }) => <StatusBadge variant={STATUS_VARIANT[row.original.status]} />,
    },
    {
      id: 'recordedQuarterDays',
      header: LABELS.cra.recorded,
      cell: ({ row }) => (
        <span className="tabular-nums">{frenchDays(row.original.recordedQuarterDays)}</span>
      ),
    },
  );

  if (role === 'consultant' || role === 'manager') {
    columns.push({
      id: 'actions',
      header: () => <span className="sr-only">{LABELS.action.tableActions}</span>,
      cell: ({ row }) => (
        <Button asChild variant="outline" size="sm" className="ml-auto flex w-fit">
          {role === 'consultant' ? (
            <Link to="/cra/$period" params={{ period: row.original.period }}>
              {LABELS.cra.show}
            </Link>
          ) : (
            <Link
              to="/cra/$period/$consultantId"
              params={{ period: row.original.period, consultantId: row.original.consultantId }}
            >
              {LABELS.cra.show}
            </Link>
          )}
        </Button>
      ),
    });
  }

  return columns;
}

interface CraListScreenProps {
  readonly role: Role;
  /** Item 7 (QA round 1). Always `[]` for a consultant persona — the route never renders the
   * filter controls for one, and `useCraList` reads exactly what it is given either way. */
  readonly consultantIds: readonly string[];
  readonly statuses: readonly CraStatus[];
  /** Item 4 (QA round 2), same "always present, manager-only controls" shape as the two above. */
  readonly year: number | undefined;
  readonly month: number | undefined;
}

/**
 * `/cra` (task 6.1, corrected; ADR-0071 for the manager column and action). `GET /api/v1/cras`
 * scopes itself server-side (a consultant sees their own months, a manager the office's —
 * Annexe A). "Ouvrir" now works for both: a consultant reaches their own editable grid, a manager
 * reaches ADR-0071's read-only view of the row's own consultant and period.
 */
export function CraListScreen({
  role,
  consultantIds,
  statuses,
  year,
  month,
}: CraListScreenProps): ReactElement {
  // `exactOptionalPropertyTypes` refuses an explicit `year: undefined`/`month: undefined` — the
  // spread omits the key entirely when there is no value, matching `CraListFilters`'s own
  // `year?: number` (present-and-a-number, or simply absent, never present-and-`undefined`).
  const filters = {
    consultantIds,
    statuses,
    ...(year === undefined ? {} : { year }),
    ...(month === undefined ? {} : { month }),
  };
  const query = useCraList(filters);
  const filtersActive =
    consultantIds.length > 0 || statuses.length > 0 || year !== undefined || month !== undefined;

  if (query.isPending) return <ListSkeleton />;

  if (query.isError) {
    const error = query.error;
    if (error instanceof ApiProblemError) {
      const action = classifyProblem(error.problem);
      if (action.kind === 'denied') {
        return <DeniedState deniedBy={action.deniedBy} role={role} />;
      }

      return (
        <ErrorState
          title={headingFor(error.problem)}
          body={sentenceFor(error.problem)}
          {...(error.problem.correlationId === undefined
            ? {}
            : { correlationId: error.problem.correlationId })}
        />
      );
    }

    return (
      <ErrorState title={LABELS.problem.heading.internal} body={LABELS.shell.unexpectedErrorBody} />
    );
  }

  const rows = query.data.cras;
  const hasAnyCra = rows.length > 0;

  return (
    <div className="flex flex-col gap-4">
      {role === 'consultant' && (
        <OpenAnotherMonth alreadyListed={new Set(rows.map((row) => row.period))} />
      )}

      {/* Manager only: a consultant persona has one Cra and never sees this — the brief's own
          words. Billing is deliberately excluded too — `columnsFor` above renders neither a
          "Consultant" column nor an "Ouvrir" action for that role (a pre-existing gap, not one
          item 7 introduces), so a filter naming consultants nothing on screen identifies would
          be worse than no filter at all. */}
      {role === 'manager' && (
        <CraListFilters
          consultantIds={consultantIds}
          statuses={statuses}
          year={year}
          month={month}
        />
      )}

      <DataTable
        columns={columnsFor(role)}
        data={rows}
        getRowId={(row) => row.id}
        emptyState={
          <EmptyState
            icon={CalendarIcon}
            title={filtersActive ? LABELS.cra.filters.emptyTitle : LABELS.cra.emptyList}
            body={filtersActive ? LABELS.cra.filters.emptyBody : LABELS.cra.emptyListHint}
            {...(!hasAnyCra && !filtersActive && role === 'consultant'
              ? {
                  action: {
                    label: LABELS.cra.show,
                    to: '/cra/$period',
                    params: { period: currentPeriod() },
                  },
                }
              : {})}
          />
        }
      />
    </div>
  );
}

/**
 * Item 7 (QA round 1): both dimensions non-exclusive (multi-select) and ANDed with each other —
 * "for these three consultants, every CRA not yet validated". Filter state lives in the URL
 * (`routes/_shell/cra.index.tsx`'s `validateSearch`), so this component only ever reads its
 * current value from props and writes a new one via `navigate`; it holds no state of its own.
 */
function CraListFilters({
  consultantIds,
  statuses,
  year,
  month,
}: {
  readonly consultantIds: readonly string[];
  readonly statuses: readonly CraStatus[];
  readonly year: number | undefined;
  readonly month: number | undefined;
}): ReactElement {
  const navigate = useNavigate();
  const roster = useConsultantRoster();
  const calendar = useCalendar();

  // `undefined`, not `[]`, once a filter clears back to empty — the search schema treats both the
  // same way ("no filter"), and this is what keeps a cleared filter's URL as plain `/cra` again
  // rather than permanently carrying `?consultantIds=%5B%5D`.
  //
  // `next` is computed by `MultiSelectCombobox`/`TogglePillGroup` from the `selected` **prop**
  // this component handed them — always exactly one value away from that same prop (their own
  // `toggle`/`activate` never changes more than one at a time; "Effacer les filtres" is the one
  // exception, an explicit `onChange([])` with no single value to name). That prop can itself lag
  // the router's own state by one render when two toggles fire in quick succession (found chasing
  // item 3/11's own fix, ADR-0083: two `navigate()` calls in flight let the second commit before
  // the first, so the first's toggle silently disappears). `toggleDiff` names the one value that
  // changed by diffing `next` against `current` — the prop `next` was actually computed from, the
  // only baseline the diff is guaranteed to be exactly one value from — and `applyDiff` replays
  // that same single change against `search`'s own `prev`, which the router keeps current
  // regardless of React's render timing, so a stale `next` replays the right diff late rather than
  // losing it or applying a different one.
  //
  // `next.length === 0` is ambiguous on its own: `toggle` unticking the *last* remaining box
  // (`current.length === 1`) and "Effacer les filtres" (`onChange([])`, reachable from any
  // `current`) both land here, and only one of them means "wipe everything". `toggle` never
  // removes more than one value at a time, so `current.length > 1` going to `next.length === 0`
  // is reachable only through the explicit clear — that is the one case treated as `clear`.
  // `current.length <= 1` is read as "remove the one value that was there" instead: against a
  // *stale* `current` (the exact case this machinery exists for), that stale value may no longer
  // be the router's only entry, and `clear` would wipe out whatever raced in ahead of it.
  type ToggleDiff =
    { readonly kind: 'add' | 'remove'; readonly value: string } | { readonly kind: 'clear' };

  function toggleDiff(current: readonly string[], next: readonly string[]): ToggleDiff {
    if (next.length === 0) {
      const [onlyValue] = current;
      return current.length <= 1 && onlyValue !== undefined
        ? { kind: 'remove', value: onlyValue }
        : { kind: 'clear' };
    }
    const added = next.find((value) => !current.includes(value));
    if (added !== undefined) return { kind: 'add', value: added };
    const removed = current.find((value) => !next.includes(value));
    return removed !== undefined ? { kind: 'remove', value: removed } : { kind: 'clear' };
  }

  function applyDiff(current: readonly string[], diff: ToggleDiff): readonly string[] {
    switch (diff.kind) {
      case 'add':
        return current.includes(diff.value) ? current : [...current, diff.value];
      case 'remove':
        return current.filter((value) => value !== diff.value);
      case 'clear':
        return [];
    }
  }

  function setConsultantIds(next: readonly string[]): void {
    const diff = toggleDiff(consultantIds, next);
    void navigate({
      to: '/cra',
      search: (prev) => {
        const updated = applyDiff(prev.consultantIds ?? [], diff);
        return { ...prev, consultantIds: updated.length === 0 ? undefined : [...updated] };
      },
    });
  }

  function setStatuses(next: readonly string[]): void {
    const diff = toggleDiff(statuses, next);
    void navigate({
      to: '/cra',
      search: (prev) => {
        const updated = applyDiff(prev.statuses ?? [], diff);
        return { ...prev, statuses: updated.length === 0 ? undefined : (updated as CraStatus[]) };
      },
    });
  }

  // Item 4 (QA round 2). A single `Select`, not `MultiSelectCombobox`/`TogglePillGroup`: each
  // change fully replaces the one value it owns, so there is no multi-value diff to race —
  // `toggleDiff`/`applyDiff` above exist for exactly the ambiguity a single-value control never
  // has. `FILTER_ALL` is a sentinel: Radix's `SelectItem` refuses an empty string value, and this
  // is the "clear this one filter" option both of these `Select`s need one of.
  function setYear(next: string): void {
    const parsed = next === FILTER_ALL ? undefined : Number.parseInt(next, 10);
    void navigate({
      to: '/cra',
      search: (prev) => ({ ...prev, year: parsed }),
    });
  }

  function setMonth(next: string): void {
    const parsed = next === FILTER_ALL ? undefined : Number.parseInt(next, 10);
    void navigate({
      to: '/cra',
      search: (prev) => ({ ...prev, month: parsed }),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectCombobox
        label={LABELS.cra.filters.consultantLabel}
        placeholder={LABELS.cra.filters.consultantPlaceholder}
        noMatchLabel={LABELS.cra.filters.consultantNoMatch}
        noneSelectedLabel={LABELS.cra.filters.consultantNoneSelected}
        clearLabel={LABELS.cra.filters.clear}
        options={(roster.data?.consultants ?? []).map((consultant) => ({
          value: consultant.id,
          label: consultant.displayName,
        }))}
        selected={consultantIds}
        onChange={setConsultantIds}
      />
      <TogglePillGroup
        label={LABELS.cra.filters.statusLabel}
        options={CRA_STATUS_ORDER.map((status) => ({
          value: status,
          label: LABELS.cra.statuses[status],
        }))}
        selected={statuses}
        onChange={setStatuses}
      />
      <Select value={year === undefined ? FILTER_ALL : String(year)} onValueChange={setYear}>
        <SelectTrigger aria-label={LABELS.cra.filters.yearLabel} className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FILTER_ALL}>{LABELS.cra.filters.yearAll}</SelectItem>
          {/* Ascending order across the whole calendar (`useCalendar`, ADR-0004/ADR-0078), not
              only the years this office's own Cras happen to cover: the same "known working
              calendar" list `OpenAnotherMonth` already reads from, so a year with nothing to show
              is still pickable (and answers the filtered-empty state) rather than silently
              impossible to select at all. */}
          {[...(calendar.data?.years ?? [])]
            .sort((a, b) => a - b)
            .map((calendarYear) => (
              <SelectItem key={calendarYear} value={String(calendarYear)}>
                {calendarYear}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <Select value={month === undefined ? FILTER_ALL : String(month)} onValueChange={setMonth}>
        <SelectTrigger aria-label={LABELS.cra.filters.monthLabel} className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FILTER_ALL}>{LABELS.cra.filters.monthAll}</SelectItem>
          {MONTH_NUMBERS.map((monthNumber) => (
            <SelectItem key={monthNumber} value={String(monthNumber)}>
              {frenchMonthName(monthNumber)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Item 2: "un consultant doit pouvoir ouvrir un CRA pour les mois à venir, vierge." */
function OpenAnotherMonth({
  alreadyListed,
}: {
  readonly alreadyListed: ReadonlySet<string>;
}): ReactElement | null {
  const calendar = useCalendar();
  const navigate = useNavigate();
  const [picked, setPicked] = useState<string | undefined>(undefined);

  if (calendar.isPending || calendar.isError) return null;

  const offered = offeredFutureMonths(calendar.data.years, alreadyListed);
  if (offered.length === 0) {
    return <p className="text-sm text-muted-foreground">{LABELS.cra.noOtherMonthToOpen}</p>;
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <label htmlFor="cra-open-another-month" className="text-label">
          {LABELS.cra.openAnotherMonth}
        </label>
        <Select onValueChange={setPicked}>
          <SelectTrigger id="cra-open-another-month" className="w-48">
            <SelectValue placeholder={LABELS.cra.openAnotherMonthPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            {offered.map((period) => (
              <SelectItem key={period} value={period}>
                {frenchMonth(period)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          disabled={picked === undefined}
          onClick={() => {
            if (picked !== undefined) {
              void navigate({ to: '/cra/$period', params: { period: picked } });
            }
          }}
        >
          {LABELS.cra.show}
        </Button>
      </div>
      <p className="text-help">{LABELS.cra.openAnotherMonthHint}</p>
    </div>
  );
}
