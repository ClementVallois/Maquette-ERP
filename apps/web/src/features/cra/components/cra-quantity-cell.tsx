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

/** The keys that enter a quantity directly — one digit per option, `0` clearing the cell. */
const DIGIT_KEYS: ReadonlySet<string> = new Set(['0', '1', '2', '3', '4']);

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
    <select
      id={cellId}
      ref={registerRef}
      value={String(value)}
      // The accessible name, and deliberately not a paired `sr-only` <label>: `sr-only` is
      // `position: absolute`, no ancestor here is positioned, so such a label resolves against the
      // initial containing block — outside the grid's own `overflow-x-auto`, which therefore does
      // not clip it. Sixty-two of them pushed the *document* scroll width past the viewport and the
      // whole page panned sideways. `aria-label` is what the two read-only branches above already
      // use, and it wins over a <label> in the name computation regardless.
      aria-label={accessibleName}
      onChange={(event) => {
        onChange(parseQuantity(event.target.value));
      }}
      onKeyDown={(event) => {
        // A modifier means the key belongs to the browser or the OS, never to the grid: Ctrl/Cmd+0
        // is the zoom reset, Alt+ArrowDown opens the native dropdown. Handling those below would
        // both swallow them and, for Ctrl+0, write a 0 into the focused cell.
        if (event.altKey || event.ctrlKey || event.metaKey) return;

        // Same reasoning as the two-slot control it replaces (ADR-0068): a closed, focused native
        // <select> moves to the adjacent option on all four arrow keys — Left/Right no less than
        // Up/Down, which is what made navigating the matrix change the values it walked past.
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          onNavigate('up');
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          onNavigate('down');
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onNavigate('left');
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          onNavigate('right');
        } else if (event.key === 'Home') {
          event.preventDefault();
          onNavigate('home');
        } else if (event.key === 'End') {
          event.preventDefault();
          onNavigate('end');
        } else if (DIGIT_KEYS.has(event.key)) {
          // With all four arrow keys claimed by navigation, a digit is what enters a value from the
          // keyboard alone. Left to the <select>, a digit would run the browser's own type-ahead,
          // which matches an <option>'s *visible glyph* rather than its `value` — "1" would land on
          // the full day (glyph "1"), not the quarter (glyph "¼").
          event.preventDefault();
          onChange(parseQuantity(event.key));
        }
      }}
      className="h-8 w-full appearance-none rounded-lg border border-input bg-background text-center text-sm text-foreground tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      {QUANTITIES.map((quantity) => (
        <option key={quantity} value={String(quantity)} aria-label={quantityOptionLabel(quantity)}>
          {GLYPHS[quantity]}
        </option>
      ))}
    </select>
  );
}
