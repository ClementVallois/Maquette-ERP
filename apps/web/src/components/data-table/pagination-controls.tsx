import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LABELS } from '@/lib/labels';

const PAGE_SIZES = [10, 20, 50] as const;

/**
 * Whether the 1-indexed `page` addresses a slice beyond the known result set — a stale bookmark,
 * a filter that shrank the set, or another visitor's change — rather than "nothing matches these
 * filters" (`total === 0`, which this deliberately reports as in range: page 1 of nothing is not
 * an impossible page, it is the correct empty page). F07: the two cases need different recovery.
 */
export function isPageOutOfRange(page: number, pageSize: number, total: number): boolean {
  return total > 0 && (page - 1) * pageSize >= total;
}

/**
 * The `{first}–{last} sur {total}` range, reconciled with `total` rather than derived from
 * `offset` alone — the bug F07 reproduced (`page=999` rendering "19961–24 sur 24 résultats").
 * `offset >= total` (nothing left to show at this offset) reads as `0–0`, never a first value
 * above the last or the total.
 */
export function rangeOf(
  offset: number,
  limit: number,
  total: number,
): { first: number; last: number } {
  if (total === 0 || offset >= total) return { first: 0, last: 0 };

  return { first: offset + 1, last: Math.min(offset + limit, total) };
}

interface PaginationControlsProps {
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
  readonly onPageChange: (offset: number) => void;
  readonly onPageSizeChange: (limit: number) => void;
}

export function PaginationControls({
  total,
  limit,
  offset,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps): ReactElement {
  const { first, last } = rangeOf(offset, limit, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <p aria-live="polite">
        {LABELS.pagination.range
          .replace('{first}', String(first))
          .replace('{last}', String(last))
          .replace('{total}', String(total))}
      </p>
      <div className="flex items-center gap-2">
        <span>{LABELS.pagination.perPage}</span>
        <Select
          value={String(limit)}
          onValueChange={(value) => {
            onPageSizeChange(Number.parseInt(value, 10));
          }}
        >
          <SelectTrigger className="w-20" aria-label={LABELS.pagination.perPage}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="icon"
          disabled={offset === 0}
          onClick={() => {
            onPageChange(Math.max(0, offset - limit));
          }}
        >
          <ChevronLeftIcon aria-hidden="true" />
          <span className="sr-only">{LABELS.pagination.previous}</span>
        </Button>
        <Button
          variant="outline"
          size="icon"
          disabled={offset + limit >= total}
          onClick={() => {
            onPageChange(offset + limit);
          }}
        >
          <ChevronRightIcon aria-hidden="true" />
          <span className="sr-only">{LABELS.pagination.next}</span>
        </Button>
      </div>
    </div>
  );
}
