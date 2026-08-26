import type { ReactElement } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LABELS } from '@/lib/labels';

/**
 * ADR-0070's matrix cell: a quantity in quarter-days, nothing else. ADR-0068's reasons for a
 * native `<select>` over the kit's own `components/ui/select.tsx` survive its supersession intact
 * (many simultaneous controls, a keyboard contract that needs a reliable open/closed signal) — see
 * that ADR. Replaces `cra-slot-control.tsx` (ADR-0070: the mission picker per half-day slot has no
 * job once the mission is the row and not a cell value).
 */

export type NavigationDirection = 'up' | 'down' | 'left' | 'right' | 'home' | 'end';

/** `0` is the empty cell — never a `CraLine`, never posted. */
export type CellQuantity = 0 | 1 | 2 | 3 | 4;

const GLYPHS: Readonly<Record<CellQuantity, string>> = { 0: '', 1: '¼', 2: '½', 3: '¾', 4: '1' };

function quantityOptionLabel(quantity: CellQuantity): string {
  const options = LABELS.cra.matrix.quantityOptions;
  if (quantity === 0) return options.empty;
  if (quantity === 1) return options.quarter;
  if (quantity === 2) return options.half;
  if (quantity === 3) return options.threeQuarters;

  return options.full;
}

const QUANTITIES: readonly CellQuantity[] = [0, 1, 2, 3, 4];

function parseQuantity(raw: string): CellQuantity {
  const parsed = Number.parseInt(raw, 10);

  return parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4 ? parsed : 0;
}

interface CraQuantityCellProps {
  /** The row's identity — a mission id, or `ABSENCE_ROW_KEY` — used only to build a stable,
   * URL-safe element id. Display uses `activityLabel` instead. */
  readonly rowKey: string;
  readonly activityLabel: string;
  readonly day: string;
  readonly dayLabel: string;
  readonly value: CellQuantity;
  readonly editable: boolean;
  readonly assignable: boolean;
  readonly onChange: (value: CellQuantity) => void;
  readonly onNavigate: (direction: NavigationDirection) => void;
  readonly registerRef: (element: HTMLSelectElement | null) => void;
}

export function CraQuantityCell({
  rowKey,
  activityLabel,
  day,
  dayLabel,
  value,
  editable,
  assignable,
  onChange,
  onNavigate,
  registerRef,
}: CraQuantityCellProps): ReactElement {
  const cellId = `cra-cell-${rowKey}-${day}`;
  const accessibleName = `${activityLabel} — ${dayLabel}`;

  if (!assignable) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            aria-disabled="true"
            aria-label={`${accessibleName} : ${LABELS.cra.matrix.notAssignableThisDay}`}
            className="flex h-8 w-full items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground/60"
          >
            {GLYPHS[0]}
          </span>
        </TooltipTrigger>
        <TooltipContent>{LABELS.cra.matrix.notAssignableThisDay}</TooltipContent>
      </Tooltip>
    );
  }

  if (!editable) {
    return (
      <span
        aria-label={accessibleName}
        className="flex h-8 w-full items-center justify-center text-sm tabular-nums"
      >
        {GLYPHS[value] === '' ? LABELS.cra.nothing : GLYPHS[value]}
      </span>
    );
  }

  return (
    <>
      <label className="sr-only" htmlFor={cellId}>
        {accessibleName}
      </label>
      <select
        id={cellId}
        ref={registerRef}
        value={String(value)}
        aria-label={accessibleName}
        onChange={(event) => {
          onChange(parseQuantity(event.target.value));
        }}
        onKeyDown={(event) => {
          // Same reasoning as the two-slot control it replaces (ADR-0068): a closed, focused
          // native <select> cycles its own options on ArrowUp/ArrowDown, which would fight the
          // matrix's own two-axis keyboard contract (task 6.4) — suppressed here so the grid can
          // own both arrow axes. ArrowLeft/ArrowRight carry no such native behaviour.
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            onNavigate('up');
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            onNavigate('down');
          } else if (event.key === 'ArrowLeft') {
            onNavigate('left');
          } else if (event.key === 'ArrowRight') {
            onNavigate('right');
          } else if (event.key === 'Home') {
            event.preventDefault();
            onNavigate('home');
          } else if (event.key === 'End') {
            event.preventDefault();
            onNavigate('end');
          }
        }}
        className="h-8 w-full appearance-none rounded-lg border border-input bg-background text-center text-sm text-foreground tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {QUANTITIES.map((quantity) => (
          <option
            key={quantity}
            value={String(quantity)}
            aria-label={quantityOptionLabel(quantity)}
          >
            {GLYPHS[quantity]}
          </option>
        ))}
      </select>
    </>
  );
}
