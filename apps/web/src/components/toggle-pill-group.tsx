import type { ReactElement } from 'react';

import { cn } from '@/lib/utils';

export interface TogglePillOption {
  readonly value: string;
  readonly label: string;
  /** Rendered after the label in parentheses when present — item 8's "a count per status if the
   * data already carries one". Omitted, not zero, when there is nothing to count yet. */
  readonly count?: number;
}

interface TogglePillGroupProps {
  readonly label: string;
  readonly options: readonly TogglePillOption[];
  readonly selected: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly className?: string;
  /**
   * `false` (default): non-exclusive — several pills may be pressed at once, `onChange` is handed
   * every pressed value. `true`: exactly one value is ever selected — clicking a pill replaces
   * `selected` with `[value]` rather than toggling it, and clicking the already-pressed one is a
   * no-op (there is no "select nothing" gesture in this mode; a dedicated "all"/"tous" option
   * plays that role, same as the invoice-status filter's own fourth pill).
   */
  readonly exclusive?: boolean;
}

const PILL_BASE =
  'inline-flex h-7 items-center gap-1 rounded-full border px-3 text-[0.8rem] font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none';
const PILL_PRESSED = 'border-primary bg-primary text-primary-foreground hover:bg-primary/80';
const PILL_UNPRESSED =
  'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground';

/**
 * A set of individually-clickable pills. Built to read as obviously clickable, which item 8 named
 * as the problem with the previous "one wide bar" reading: each pill carries its own border, so
 * an unpressed one is visibly a *button* rather than a segment of a single background — plus a
 * hover state and a focus-visible ring `Button`/`Badge` already give every other clickable
 * control in this app.
 *
 * Two selection models, one visual language, one accessibility pattern — "the two filter UIs
 * should look like they were designed by the same person" (QA round 1, item 8's own words about
 * item 7). Both `exclusive={false}` (item 7's CRA-status filter) and `exclusive={true}` (item 8's
 * invoice-status filter) render `role="group"` with `aria-pressed` toggle buttons, not
 * `role="radiogroup"`/`role="radio"`. The radio pattern is the textbook-correct one for "exactly
 * one of these", but it obliges arrow-key roving-tabindex navigation between the radios (WAI-ARIA
 * APG), which this component does not implement and axe-core's static audit does not catch either
 * way — a silent gap, not a documented trade-off. `aria-pressed` on every pill, exclusive or not,
 * is explicitly allowed by the brief ("aria-pressed, or a real radio/checkbox group") and keeps
 * one code path with no unmet keyboard obligation.
 */
export function TogglePillGroup({
  label,
  options,
  selected,
  onChange,
  className,
  exclusive = false,
}: TogglePillGroupProps): ReactElement {
  const selectedSet = new Set(selected);

  function activate(value: string): void {
    if (exclusive) {
      if (!selectedSet.has(value)) onChange([value]);
      return;
    }

    onChange(
      selectedSet.has(value) ? selected.filter((entry) => entry !== value) : [...selected, value],
    );
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex flex-wrap items-center gap-1.5', className)}
    >
      {options.map((option) => {
        const pressed = selectedSet.has(option.value);

        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            onClick={() => {
              activate(option.value);
            }}
            className={cn(PILL_BASE, pressed ? PILL_PRESSED : PILL_UNPRESSED)}
          >
            {option.label}
            {/* No opacity dimming: `--muted-foreground` is already the deliberately-chosen
                lower-emphasis token (`globals.css`), and reducing it further with `opacity-70`
                lightened it past WCAG AA's 4.5:1 minimum against this background (axe:
                `color-contrast`, measured 3.45:1) — a real violation the earlier styling
                introduced, caught once the manager's `/cra` filters gained axe coverage. */}
            {option.count !== undefined && (
              <span
                className={cn(
                  'tabular-nums',
                  pressed ? 'text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                ({option.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
