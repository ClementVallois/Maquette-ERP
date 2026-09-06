import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react';
import type { PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react';
import { useRef, useState } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

/**
 * `header.column.columnDef.meta.headerAdornment`: a column whose header itself carries an
 * interactive affordance (a glossary term's Popover trigger, e.g. `features/marge`'s `tjm`
 * column) cannot be `flexRender`ed inside this component's own sort `<button>` — axe's
 * `nested-interactive` rule (WCAG 4.1.2) forbids a control inside a control, and a screen reader
 * cannot announce the inner one reliably either. `header` stays the plain sortable label (what
 * every other column already passes); `headerAdornment` renders as that label's sibling, next to
 * the sort button rather than inside it, so both affordances — sort, and the term's own
 * definition — stay reachable.
 */
declare module '@tanstack/react-table' {
  // `TData`/`TValue` are required, unused, by TypeScript's own declaration-merging rule (TS2428:
  // every declaration of an interface must repeat identical type parameters) — table-core's own
  // `ColumnMeta<TData extends RowData, TValue>` names them, so this merge must too.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    readonly headerAdornment?: ReactNode;
  }
}

/**
 * The generic table `docs/frontend-plan.md` §3 names (`components/data-table/`), headless via
 * TanStack Table (task 6.1's dependency) with the design 100% on `components/ui/table.tsx`'s
 * tokens. No toolbar/pagination in this phase: every table Phase 6 renders fits inside the API's
 * own 50-row cap without a second page (`Mes CRA` holds one row per period a consultant has ever
 * saved), so building one now would be for a caller that does not exist yet — Phase 7/8's tables,
 * with real filters and real multi-page lists, are where a toolbar earns its place.
 */
interface DataTableProps<TData> {
  readonly columns: readonly ColumnDef<TData>[];
  readonly data: readonly TData[];
  readonly getRowId: (row: TData) => string;
  /** Rendered instead of the table body when `data` is empty — the caller's own `EmptyState`. */
  readonly emptyState: ReactNode;
  readonly numericColumns?: readonly string[];
  /**
   * `false` on a server-paginated table: this component sorts client-side, so it only ever has the
   * loaded page to sort. Why that means no sort control rather than a page-scoped one, and what
   * would replace it: README § "Ce que je ne construis pas", and `docs/open-questions.md` (row
   * dated 05/09/2026) for the decision that is still open.
   */
  readonly sortable?: boolean;
  /**
   * Row-click-to-open, additive to the per-row `Link`/`Button asChild><Link>` every caller's
   * `actions` column already renders — that link stays the keyboard and screen-reader path; this
   * is a pointer-only convenience on top of it, so no `role`/`tabIndex` goes on `<tr>`.
   *
   * A plain `onClick` fires after a drag: on mobile this table's own wrapper
   * (`components/ui/table.tsx`) scrolls horizontally, and the page around it scrolls vertically,
   * and some mobile browsers still synthesize a click at the drag's end point. So this is built on
   * `pointerdown`/`pointerup` instead — origin and pointer id recorded on down, activation gated on
   * up by movement (<10px both axes), dwell time (<500ms), an empty text selection (rules out a
   * desktop text-drag release) and the up target not landing inside an interactive descendant
   * (rules out double-navigating the row's own "Ouvrir" link).
   */
  readonly onRowActivate?: (row: TData) => void;
}

/** Movement past this, on either axis, means "drag", not "tap" — a table scrolls in both: its own
 * wrapper horizontally, the page around it vertically. */
const ACTIVATION_MOVE_THRESHOLD_PX = 10;
/** Above this dwell time between `pointerdown` and `pointerup`, it reads as a long-press/hold
 * rather than a tap and is not treated as row activation. */
const ACTIVATION_MAX_DWELL_MS = 500;
/** A control nested inside the row (the `actions` column's own `Link`/`Button`, or any other
 * focusable element a column renders) owns its own click — the row must not double-handle it. */
const INTERACTIVE_DESCENDANT_SELECTOR = 'a,button,input,select,textarea,label,[role="button"]';

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  emptyState,
  numericColumns = [],
  sortable = true,
  onRowActivate,
}: DataTableProps<TData>): ReactElement {
  const [sorting, setSorting] = useState<SortingState>([]);
  const numericColumnIds = new Set(numericColumns);
  // One shared origin, not one per row: pointer input is one contact at a time, and `pointerId`
  // below is what ties a row's `pointerup` back to the `pointerdown` that started on that same
  // row, so a drag that starts on one row and releases over another activates neither.
  const activationOrigin = useRef<{
    readonly x: number;
    readonly y: number;
    readonly t: number;
    readonly pointerId: number;
    readonly rowId: string;
  } | null>(null);
  // `react-hooks/incompatible-library` flags `useReactTable` by name for every caller, React
  // Compiler or not: it is one of three libraries the rule hardcodes (React Hook Form's
  // `useForm`, TanStack Table's `useReactTable`, TanStack Virtual's `useVirtualizer`) because each
  // returns functions a compiler cannot prove are stable. This repository has no React Compiler
  // plugin wired into `vite.config.ts` — verified, not assumed — so the hazard the rule guards
  // against (a stale memoized child holding a function this hook rotated under it) cannot occur
  // yet; `docs/frontend-plan.md` §1 is what names TanStack Table as the dependency in the first
  // place. Same shape as `routes/_shell.tsx`'s `only-throw-error` disable: a framework contract
  // the rule does not know about, not a rule being relaxed for convenience.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data as TData[],
    columns: columns as ColumnDef<TData>[],
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getRowId,
    // `enableSorting: false` (table-wide, not per-column) is what makes `header.column.getCanSort()`
    // false for every column below regardless of each `ColumnDef`'s own default — the same branch
    // that already renders a plain header, with no button and no icon, for a column that opts out
    // one at a time (the `actions` column every screen already has) now renders every column that
    // way when the *table* opts out.
    enableSorting: sortable,
    state: { sorting },
    onSortingChange: setSorting,
  });

  if (data.length === 0) return <>{emptyState}</>;

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const headerContent = header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext());
                const headerAdornment = header.column.columnDef.meta?.headerAdornment;
                const sortIcon =
                  sorted === 'asc' ? (
                    <ArrowUpIcon className="size-3.5" aria-hidden="true" />
                  ) : sorted === 'desc' ? (
                    <ArrowDownIcon className="size-3.5" aria-hidden="true" />
                  ) : (
                    <ArrowUpDownIcon className="size-3.5 opacity-50" aria-hidden="true" />
                  );
                const sortButton = (
                  <button
                    type="button"
                    className={cn(
                      'inline-flex items-center gap-1 hover:text-foreground',
                      // The `ml-auto` that right-aligns a numeric column's sort button moves to
                      // the wrapping `<div>` below when a `headerAdornment` sits beside it —
                      // otherwise it stays here, unchanged from before this column ever had one.
                      numericColumnIds.has(header.column.id) && !headerAdornment && 'ml-auto',
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {headerContent}
                    {sortIcon}
                  </button>
                );

                return (
                  <TableHead
                    key={header.id}
                    className={cn(numericColumnIds.has(header.column.id) && 'text-right')}
                    aria-sort={
                      sorted === false ? undefined : sorted === 'asc' ? 'ascending' : 'descending'
                    }
                  >
                    {header.column.getCanSort() ? (
                      headerAdornment ? (
                        <div
                          className={cn(
                            'inline-flex items-center gap-1',
                            numericColumnIds.has(header.column.id) && 'ml-auto',
                          )}
                        >
                          {sortButton}
                          {headerAdornment}
                        </div>
                      ) : (
                        sortButton
                      )
                    ) : (
                      <>
                        {headerContent}
                        {headerAdornment}
                      </>
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => {
            const activationHandlers =
              onRowActivate === undefined
                ? {}
                : {
                    onPointerDown: (event: ReactPointerEvent<HTMLTableRowElement>) => {
                      activationOrigin.current = {
                        x: event.clientX,
                        y: event.clientY,
                        t: Date.now(),
                        pointerId: event.pointerId,
                        rowId: row.id,
                      };
                    },
                    onPointerUp: (event: ReactPointerEvent<HTMLTableRowElement>) => {
                      const origin = activationOrigin.current;
                      activationOrigin.current = null;
                      // Both the pointer (no cross-pointer mixup) and the row (a press near a
                      // boundary must not release into the neighbour and activate it) have to
                      // match the one this same `pointerup` fired on.
                      if (origin?.pointerId !== event.pointerId || origin.rowId !== row.id) return;
                      if (Date.now() - origin.t >= ACTIVATION_MAX_DWELL_MS) return;
                      if (
                        Math.abs(event.clientX - origin.x) >= ACTIVATION_MOVE_THRESHOLD_PX ||
                        Math.abs(event.clientY - origin.y) >= ACTIVATION_MOVE_THRESHOLD_PX
                      ) {
                        return;
                      }
                      if ((document.getSelection()?.toString() ?? '') !== '') return;
                      const target = event.target;
                      if (
                        target instanceof Element &&
                        target.closest(INTERACTIVE_DESCENDANT_SELECTOR) !== null
                      ) {
                        return;
                      }
                      onRowActivate(row.original);
                    },
                    onPointerCancel: () => {
                      activationOrigin.current = null;
                    },
                  };

            return (
              <TableRow
                key={row.id}
                className={cn(onRowActivate !== undefined && 'cursor-pointer')}
                {...activationHandlers}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(numericColumnIds.has(cell.column.id) && 'text-right')}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
