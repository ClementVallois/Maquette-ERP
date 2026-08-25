import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import type { ReactElement, ReactNode } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
}

export function DataTable<TData>({
  columns,
  data,
  getRowId,
  emptyState,
}: DataTableProps<TData>): ReactElement {
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
    getRowId,
  });

  if (data.length === 0) return <>{emptyState}</>;

  return (
    <div className="overflow-hidden rounded-xl bg-card shadow-card ring-1 ring-border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
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
