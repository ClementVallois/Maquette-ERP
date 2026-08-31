import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  readonly value: string;
  readonly label: string;
}

interface MultiSelectComboboxProps {
  readonly label: string;
  readonly placeholder: string;
  readonly noMatchLabel: string;
  readonly noneSelectedLabel: string;
  readonly clearLabel: string;
  readonly options: readonly MultiSelectOption[];
  readonly selected: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly className?: string;
}

/**
 * Item 7 (QA round 1): "usable with 40+ consultants (a searchable combobox, not a 40-item
 * checkbox list)". No `command`/combobox primitive existed in `components/ui/` before this one —
 * checked (BUILD-RULES "a new dependency is proposed, never just added") — so this is built from
 * primitives already vendored (`Popover`, `Input`, `Checkbox`), not `cmdk` or another package.
 *
 * A search field filters the option list client-side (the option list itself — consultant names —
 * is already in memory, fetched once; this never re-fetches per keystroke). Selection is
 * checkboxes, not a second click-to-close-per-item pattern, because "these three consultants" is
 * the brief's own example of what has to stay selectable at once without the popover closing.
 */
export function MultiSelectCombobox({
  label,
  placeholder,
  noMatchLabel,
  noneSelectedLabel,
  clearLabel,
  options,
  selected,
  onChange,
  className,
}: MultiSelectComboboxProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedSet = new Set(selected);
  const query = search.trim().toLowerCase();
  const filtered =
    query.length === 0
      ? options
      : options.filter((option) => option.label.toLowerCase().includes(query));

  function toggle(value: string): void {
    onChange(
      selectedSet.has(value) ? selected.filter((entry) => entry !== value) : [...selected, value],
    );
  }

  const selectedLabels = options
    .filter((option) => selectedSet.has(option.value))
    .map((option) => option.label);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={label}
          className={cn('w-fit min-w-40 justify-between font-normal', className)}
        >
          {/* A count, never the selected names themselves: joined names would duplicate
              whatever the filtered table already shows them against (and grow without bound
              well before 40+ consultants), so "3 consultants" is what a manager reads here,
              and their names live only inside the popover's own chip list below. */}
          <span className="truncate">
            {selectedLabels.length === 0
              ? noneSelectedLabel
              : `${label} (${String(selectedLabels.length)})`}
          </span>
          <ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2" aria-label={label}>
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          autoFocus
        />
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1.5">
            {selectedLabels.map((entry) => (
              <Badge key={entry} variant="secondary" className="gap-1">
                {entry}
              </Badge>
            ))}
          </div>
        )}
        {/* A checkbox group, not a listbox: `role="listbox"` demands `role="option"` children
            (axe: `aria-required-children`, impact critical), and a plain `<li>` only ever carries
            the implicit `listitem` role. This list is a set of checkboxes with labels — `<ul>` is
            layout only, no ARIA role needed on it. */}
        <ul className="mt-1.5 flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {filtered.length === 0 && (
            <li className="px-2 py-1.5 text-sm text-muted-foreground">{noMatchLabel}</li>
          )}
          {filtered.map((option) => {
            const checked = selectedSet.has(option.value);

            return (
              <li key={option.value}>
                <label className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => {
                      toggle(option.value);
                    }}
                  />
                  <span className="flex-1 truncate">{option.label}</span>
                  {checked && <CheckIcon aria-hidden="true" className="size-3.5 text-primary" />}
                </label>
              </li>
            );
          })}
        </ul>
        {selected.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-center text-muted-foreground"
            onClick={() => {
              onChange([]);
            }}
          >
            <XIcon aria-hidden="true" />
            {clearLabel}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
