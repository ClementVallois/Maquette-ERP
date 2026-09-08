import { ChevronDownIcon, EraserIcon, ListChecksIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import type { ReactElement } from 'react';

import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

import { ABSENCE_ROW_KEY, isRowEmpty, type MatrixState } from '../matrix';
import { missionTone } from '../mission-tone';
import type { CraGridResponse } from '../types';

import type { MatrixRowMeta } from './cra-matrix-table';

// The phone has no table row to host RowTools. Keep the same rules here: Absence cannot be removed,
// and another row must be empty before removal; disabling keeps the action discoverable on touch.
export function MobileRowTools({
  rows,
  matrix,
  monthDays,
  onClear,
  onRemove,
}: {
  readonly rows: readonly MatrixRowMeta[];
  readonly matrix: MatrixState;
  readonly monthDays: readonly string[];
  readonly onClear: (rowKey: string) => void;
  readonly onRemove: (rowKey: string) => void;
}): ReactElement | null {
  if (rows.length === 0) return null;

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button type="button" variant="outline" className="group min-h-11 w-full justify-between">
          {LABELS.cra.matrix.manageRows}
          <ChevronDownIcon
            aria-hidden="true"
            className="size-4 transition-transform group-data-[state=open]:rotate-180"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-xl bg-card px-3 ring-1 ring-border">
        {rows.map((row) => {
          const empty = isRowEmpty(matrix, row.key, monthDays);

          return (
            <div
              key={row.key}
              className="flex items-center gap-2 border-b border-border py-1 last:border-0"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-2 shrink-0 rounded-full',
                  row.toneIndex === null ? 'bg-absence-dot' : missionTone(row.toneIndex).dotClass,
                )}
              />
              <span className="min-w-0 flex-1 break-words text-sm">{row.label}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                disabled={empty}
                aria-label={`${LABELS.cra.matrix.clearRow} — ${row.label}`}
                onClick={() => {
                  onClear(row.key);
                }}
              >
                <EraserIcon />
              </Button>
              {row.key !== ABSENCE_ROW_KEY && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  disabled={!empty}
                  aria-label={`${LABELS.cra.matrix.removeRow} — ${row.label}`}
                  onClick={() => {
                    onRemove(row.key);
                  }}
                >
                  <Trash2Icon />
                </Button>
              )}
            </div>
          );
        })}
        <p className="border-t border-border py-2 text-xs text-muted-foreground">
          {LABELS.cra.matrix.removeRowHint}
        </p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function RowToolButton({
  label,
  onClick,
  children,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactElement;
}): ReactElement {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function RowTools({
  row,
  empty,
  onFill,
  onClear,
  onRemove,
}: {
  readonly row: MatrixRowMeta;
  readonly empty: boolean;
  readonly onFill: () => void;
  readonly onClear: () => void;
  readonly onRemove: () => void;
}): ReactElement {
  return (
    <>
      <RowToolButton
        label={`${LABELS.cra.matrix.fillEmptyWorkdays} — ${row.label}`}
        onClick={onFill}
      >
        <ListChecksIcon />
      </RowToolButton>
      <RowToolButton label={`${LABELS.cra.matrix.clearRow} — ${row.label}`} onClick={onClear}>
        <EraserIcon />
      </RowToolButton>
      {row.key !== ABSENCE_ROW_KEY && empty && (
        <RowToolButton label={`${LABELS.cra.matrix.removeRow} — ${row.label}`} onClick={onRemove}>
          <Trash2Icon />
        </RowToolButton>
      )}
    </>
  );
}

export function AddActivityControl({
  missions,
  onAdd,
}: {
  readonly missions: CraGridResponse['missions'];
  readonly onAdd: (missionId: string) => void;
}): ReactElement {
  return (
    // Remount after an addition: the selected mission leaves this list, so retaining its value
    // would leave the controlled picker pointing at an option that no longer exists.
    <Select key={missions.length} onValueChange={onAdd}>
      {/* `min-h-*` must override the trigger's `data-[size=default]:h-8` variant. Keeping the
          value flexible also prevents `justify-between` from centring it away from the plus icon. */}
      <SelectTrigger
        className="min-h-11 w-full *:data-[slot=select-value]:flex-1 md:min-h-0 md:w-64"
        aria-label={LABELS.cra.matrix.addActivity}
      >
        <PlusIcon className="size-4" />
        <SelectValue placeholder={LABELS.cra.matrix.addActivityPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        {missions.map((mission) => (
          <SelectItem key={mission.missionId} value={mission.missionId}>
            {mission.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
