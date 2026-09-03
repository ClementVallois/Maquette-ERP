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
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);

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
