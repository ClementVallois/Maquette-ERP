import type { ReactElement } from 'react';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCalendar } from '@/lib/calendar';

/** Radix's `SelectItem` refuses an empty string value — the "no filter" sentinel this needs one
 * of. Never sent to the API or read from the URL: `handleChange` below translates a click on it
 * back to `undefined` before it ever reaches the caller's own `onChange`. */
const FILTER_ALL = 'all';

interface YearFilterSelectProps {
  readonly value: number | undefined;
  readonly onChange: (next: number | undefined) => void;
  readonly label: string;
  readonly allLabel: string;
  readonly className?: string;
}

/**
 * The year `Select` shared by `/cra`'s filters and `/factures`, rather than a raw
 * `<Input type="number">` in each. `useCalendar` (`@/lib/calendar`) is where both screens read the
 * offered years from.
 */
export function YearFilterSelect({
  value,
  onChange,
  label,
  allLabel,
  className,
}: YearFilterSelectProps): ReactElement {
  const calendar = useCalendar();
  const years = [...(calendar.data?.years ?? [])].sort((a, b) => a - b);
  // Out-of-range guard: `/factures`' own search schema accepts any int 2000-2100, so a bookmarked
  // `?year=1999` would match no `SelectItem` and Radix would render a blank trigger. Spliced in
  // the same way `SingleSelectCombobox`'s `alwaysInclude` keeps a selected option present even
  // when it does not otherwise belong in the offered list.
  const offeredYears =
    value !== undefined && !years.includes(value) ? [...years, value].sort((a, b) => a - b) : years;

  function handleChange(next: string): void {
    onChange(next === FILTER_ALL ? undefined : Number.parseInt(next, 10));
  }

  return (
    <Select value={value === undefined ? FILTER_ALL : String(value)} onValueChange={handleChange}>
      {/* `w-48`, not `w-36` (144px), which clips "Toutes les années" to "Toutes les anné". The
          panel matches the trigger's own width via `position: popper`, so the trigger is the only
          thing that needs the size. */}
      <SelectTrigger aria-label={label} className={className ?? 'w-48'}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={FILTER_ALL}>{allLabel}</SelectItem>
        {/* Ascending order across the whole calendar (ADR-0004/ADR-0078), not only the years this
            office's own rows happen to cover: a year with nothing to show is still pickable
            (and answers the filtered-empty state) rather than silently impossible to select. */}
        {offeredYears.map((calendarYear) => (
          <SelectItem key={calendarYear} value={String(calendarYear)}>
            {calendarYear}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
