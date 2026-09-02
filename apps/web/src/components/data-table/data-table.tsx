import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';

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
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  emptyState,
  numericColumns = [],
}: DataTableProps<TData>): ReactElement {
  const [sorting, setSorting] = useState<SortingState>([]);
  const numericColumnIds = new Set(numericColumns);
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
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell
                  key={cell.id}
                  className={cn(numericColumnIds.has(cell.column.id) && 'text-right')}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
