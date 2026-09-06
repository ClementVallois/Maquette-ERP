import type { ReactElement, ReactNode } from 'react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
}

interface ComboboxShellProps {
  /** Accessible name shared by the trigger button and the popover panel. */
  readonly ariaLabel: string;
  /** Full content of the trigger button — text and chevron — belongs to the caller, since the
   * two variants' trigger text differs (a count for multi, one name for single). */
  readonly triggerContent: ReactNode;
  readonly triggerClassName?: string;
  /** Forwarded to the trigger `Button`'s own `id`, so a caller's `<Label htmlFor>` can target it
   * — the trigger's `aria-label` is still what names it; the visible `<Label>` is for sighted
   * users reading the form's structure. */
  readonly triggerId?: string;
  /** Forwarded to the trigger `Button`'s own `aria-invalid`/`aria-describedby` — a caller-owned
   * validation message (e.g. "choose a consultant") needs to reach the one focusable element
   * this whole widget has, exactly as it would on a native `<select>`. */
  readonly triggerAriaInvalid?: boolean;
  readonly triggerAriaDescribedBy?: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly noMatchLabel: string;
  readonly options: readonly ComboboxOption[];
  /** Client-side match predicate — kept a prop rather than hardcoded so the multi-select's
   * existing plain `toLowerCase().includes()` and the single-select's accent-insensitive
   * `normalize` can both reuse this shell without either changing the other's behaviour. */
  readonly matches: (option: ComboboxOption, query: string) => boolean;
  /**
   * An option this predicate accepts is offered even when it fails `matches` against the current
   * query — the single-select's "keep the currently chosen consultant in the list" rule
   * (previously a synthetic extra `<option>` next to the native `<select>` this replaces). Kept
   * separate from `matches` rather than folded into it: a query that matches nothing real still
   * has to say so (`noMatchLabel`), which only holds if "no *real* match" and "always-offered
   * anyway" are counted differently. The multi-select passes nothing here — every one of its
   * matches is a real one.
   */
  readonly alwaysInclude?: (option: ComboboxOption) => boolean;
  /** One `<li>`'s content. `close` lets a variant that selects-and-closes (single) do so; the
   * variant that keeps the popover open across several picks (multi) simply never calls it. */
  readonly renderOption: (option: ComboboxOption, close: () => void) => ReactNode;
  /** Below the option list, inside the popover — the multi-select's "Tout désélectionner"
   * button; the single-select does not use this slot (its clear affordance lives in the
   * trigger). */
  readonly footer?: ReactNode;
}

/**
 * Item 7 (QA round 1)'s shared foundation: a `Popover` + search `Input` + scrollable `<ul>` of
 * option rows, extracted out of the original `MultiSelectCombobox` so a single-select variant
 * (task: consultant picker in the assignment forms) does not copy-paste it. Still no
 * `cmdk`/`command` primitive — `MultiSelectCombobox`'s own docblock already recorded why
 * (`aria-required-children` and the vendored-primitives-only rule), and this shell is built from
 * exactly the same primitives (`Popover`, `Input`).
 *
 * `<ul>` stays layout-only, no ARIA role: `role="listbox"` demands `role="option"` children
 * (axe `aria-required-children`, critical), and this component never adds either — each row is
 * whatever `renderOption` returns (a labelled `Checkbox` for multi, a plain `<button>` for
 * single), never nested inside another interactive control.
 */
export function ComboboxShell({
  ariaLabel,
  triggerContent,
  triggerClassName,
  triggerId,
  triggerAriaInvalid,
  triggerAriaDescribedBy,
  searchLabel,
  searchPlaceholder,
  noMatchLabel,
  options,
  matches,
  alwaysInclude,
  renderOption,
  footer,
}: ComboboxShellProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const query = search.trim();
  const realMatches = query === '' ? options : options.filter((option) => matches(option, query));
  const forced =
    alwaysInclude === undefined
      ? []
      : options.filter((option) => alwaysInclude(option) && !realMatches.includes(option));
  const filtered = [...realMatches, ...forced];
  const noRealMatch = realMatches.length === 0;

  function close(): void {
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          {...(triggerId === undefined ? {} : { id: triggerId })}
          {...(triggerAriaInvalid === undefined ? {} : { 'aria-invalid': triggerAriaInvalid })}
          {...(triggerAriaDescribedBy === undefined
            ? {}
            : { 'aria-describedby': triggerAriaDescribedBy })}
          aria-label={ariaLabel}
          className={cn('w-fit min-w-40 justify-between font-normal', triggerClassName)}
        >
          {triggerContent}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2" aria-label={ariaLabel}>
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          placeholder={searchPlaceholder}
          aria-label={searchLabel}
          autoFocus
        />
        <ul className="mt-1.5 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {noRealMatch && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">{noMatchLabel}</li>
          )}
          {filtered.map((option) => (
            <li key={option.value}>{renderOption(option, close)}</li>
          ))}
        </ul>
        {footer}
      </PopoverContent>
    </Popover>
  );
}
