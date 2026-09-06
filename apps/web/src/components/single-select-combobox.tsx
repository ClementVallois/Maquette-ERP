import { ChevronDownIcon, XIcon } from 'lucide-react';
import type { ReactElement } from 'react';

import { ComboboxShell, type ComboboxOption } from '@/components/combobox-shell';
import { Button } from '@/components/ui/button';
import { normalizeForSearch } from '@/lib/utils';

export type { ComboboxOption };

interface SingleSelectComboboxProps {
  /** Accessible name for the trigger button and the popover panel (e.g. "Consultant"). */
  readonly label: string;
  /** Accessible name of the search input, distinct from its placeholder — e.g. "Rechercher un
   * consultant" versus "Nom du consultant…". */
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly noneSelectedLabel: string;
  readonly noMatchLabel: string;
  readonly clearLabel: string;
  readonly options: readonly ComboboxOption[];
  /** `''` means nothing selected — the same empty-string sentinel the native `<select>` this
   * replaces used, so a caller's existing `form.consultantId === ''` guard needs no change. */
  readonly value: string;
  readonly onChange: (next: string) => void;
  readonly id?: string;
  readonly className?: string;
  /** Forwarded to the trigger's own `aria-invalid`/`aria-describedby` — a caller's client-side
   * "you must choose one" validation message, since there is no native `required` attribute on
   * a `Button`+`Popover` pair to carry it for free the way there was on the `<select>` this
   * replaces. */
  readonly invalid?: boolean;
  readonly describedById?: string;
}

/**
 * The consultant picker in the assignment forms (`assignment-screen.tsx`): one searchable
 * dropdown replacing the previous pair (a standalone search `Input` filtering a separate native
 * `<select>`) — two controls for one job. Shares `ComboboxShell` with `MultiSelectCombobox`
 * rather than copy-pasting it; the two differ in exactly the ways a single choice differs from
 * several: picking an option here closes the popover immediately (`renderOption` calls the
 * `close` `ComboboxShell` hands it, which the multi-select never does), the trigger shows the one
 * chosen name instead of a count, and the search match is accent-insensitive
 * (`normalizeForSearch`, reused from `assignment-screen.tsx`'s own former inline helper) rather
 * than the multi-select's plain substring match.
 *
 * The clear affordance lives in the popover's footer, exactly where the multi-select's own
 * "Tout désélectionner" button lives, rather than as a second icon inside the trigger `Button` —
 * a control nested inside a control is the same `nested-interactive` (WCAG 4.1.2) `DataTable`'s
 * own docblock already cites, and the trigger is a single `Button` end to end.
 *
 * Two behaviours the previous two-control version had, preserved here rather than dropped by the
 * rewrite:
 * - a departed consultant (ADR-0079) never appears — enforced by the caller, which is the one
 *   that knows what "departed" means for a `Consultant`; this component only ever sees the
 *   `options` list it is handed;
 * - the currently selected option stays offered even when it no longer matches the search query
 *   (previously a synthetic `<option>` spliced in next to the native `<select>`'s own filtered
 *   ones) — `ComboboxShell`'s `alwaysInclude` below is what keeps it there, kept apart from
 *   `matches` so a query that matches nothing real still shows `noMatchLabel` alongside it.
 */
export function SingleSelectCombobox({
  label,
  searchLabel,
  searchPlaceholder,
  noneSelectedLabel,
  noMatchLabel,
  clearLabel,
  options,
  value,
  onChange,
  id,
  className,
  invalid,
  describedById,
}: SingleSelectComboboxProps): ReactElement {
  const selected = options.find((option) => option.value === value);

  return (
    <ComboboxShell
      ariaLabel={label}
      {...(id === undefined ? {} : { triggerId: id })}
      {...(className === undefined ? {} : { triggerClassName: className })}
      {...(invalid === undefined ? {} : { triggerAriaInvalid: invalid })}
      {...(describedById === undefined ? {} : { triggerAriaDescribedBy: describedById })}
      triggerContent={
        <>
          <span className="truncate">{selected?.label ?? noneSelectedLabel}</span>
          <ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />
        </>
      }
      searchLabel={searchLabel}
      searchPlaceholder={searchPlaceholder}
      noMatchLabel={noMatchLabel}
      options={options}
      matches={(option, query) =>
        normalizeForSearch(option.label).includes(normalizeForSearch(query))
      }
      alwaysInclude={(option) => option.value === value}
      renderOption={(option, close) => (
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
          aria-current={option.value === value ? 'true' : undefined}
          onClick={() => {
            onChange(option.value);
            close();
          }}
        >
          <span className="flex-1 truncate">{option.label}</span>
        </button>
      )}
      footer={
        value !== '' && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-1 w-full justify-center text-muted-foreground"
            onClick={() => {
              onChange('');
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
