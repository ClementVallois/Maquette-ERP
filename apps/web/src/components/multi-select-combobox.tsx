import { ChevronDownIcon, XIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { ComboboxShell, type ComboboxOption } from '@/components/combobox-shell';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

/** The pre-extraction name, kept so nothing importing it has to change. */
export type MultiSelectOption = ComboboxOption;

interface MultiSelectComboboxProps {
  readonly label: string;
  readonly placeholder: string;
  readonly noMatchLabel: string;
  readonly noneSelectedLabel: string;
  readonly clearLabel: string;
  readonly options: readonly ComboboxOption[];
  readonly selected: readonly string[];
  readonly onChange: (next: string[]) => void;
  readonly className?: string;
}

/**
 * Usable with 40+ consultants: a searchable combobox, not a 40-item checkbox list. Built from
 * primitives already vendored (`Popover`, `Input`, `Checkbox`) rather than `cmdk` or another
 * package — BUILD-RULES: "a new dependency is proposed, never just added".
 *
 * A search field filters the option list client-side (the option list itself — consultant names —
 * is already in memory, fetched once; this never re-fetches per keystroke). Selection is
 * checkboxes, not a second click-to-close-per-item pattern, because "these three consultants" is
 * the brief's own example of what has to stay selectable at once without the popover closing —
 * `ComboboxShell`'s `renderOption` below never calls the `close` it is handed, unlike the
 * single-select consultant picker (`single-select-combobox.tsx`) that shares this same shell.
 *
 * The `Popover`/`Input`/scrollable-`<ul>` mechanics live in `ComboboxShell` now, extracted so the
 * single-select variant did not copy-paste them; this component's own props and behaviour are
 * unchanged, including the plain `toLowerCase().includes()` match (not the accent-insensitive
 * `normalize` the single-select uses) — moving to the shell was not licence to change what a
 * caller of this one already relies on.
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
  const selectedSet = new Set(selected);

  function toggle(value: string): void {
    onChange(
      selectedSet.has(value) ? selected.filter((entry) => entry !== value) : [...selected, value],
    );
  }

  const selectedLabels = options
    .filter((option) => selectedSet.has(option.value))
    .map((option) => option.label);

  return (
    <ComboboxShell
      ariaLabel={label}
      {...(className === undefined ? {} : { triggerClassName: className })}
      triggerContent={
        // A count, never the selected names themselves: joined names would duplicate whatever
        // the filtered table already shows them against (and grow without bound well before
        // 40+ consultants), so "3 consultants" is what a manager reads here. The checkbox state
        // below is the one place that answers "which".
        <>
          <span className="truncate">
            {selectedLabels.length === 0
              ? noneSelectedLabel
              : `${label} (${String(selectedLabels.length)})`}
          </span>
          <ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
        </>
      }
      searchLabel={placeholder}
      searchPlaceholder={placeholder}
      noMatchLabel={noMatchLabel}
      options={options}
      matches={(option, query) => option.label.toLowerCase().includes(query.toLowerCase())}
      renderOption={(option) => {
        const checked = selectedSet.has(option.value);

        return (
          <label className="group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
            <Checkbox
              checked={checked}
              onCheckedChange={() => {
                toggle(option.value);
              }}
            />
            <span className="flex-1 truncate">{option.label}</span>
          </label>
        );
      }}
      footer={
        selected.length > 0 && (
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
        )
      }
    />
  );
}
