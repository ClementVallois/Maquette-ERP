import type { ReactElement } from 'react';

import { frenchDate } from '@/lib/format';
import { LABELS } from '@/lib/labels';

import type { SlotValue } from '../slots';
import type { GridMission } from '../types';

/**
 * ADR-0068: a native `<select>`, not `components/ui/select.tsx` — see the ADR for why, at this
 * screen's scale. Styled to match the kit's own input tokens (`--input` boundary, `--ring` focus).
 */

export type NavigationDirection = 'up' | 'down' | 'left' | 'right';

const EMPTY_OPTION = '';
const ABSENCE_OPTION = 'absence';

function optionValue(slot: SlotValue): string {
  if (slot.kind === 'empty') return EMPTY_OPTION;
  if (slot.kind === 'absence') return ABSENCE_OPTION;

  return slot.missionId;
}

function slotToValue(raw: string): SlotValue {
  if (raw === EMPTY_OPTION) return { kind: 'empty' };
  if (raw === ABSENCE_OPTION) return { kind: 'absence' };

  return { kind: 'mission', missionId: raw };
}

export function labelForSlot(slot: SlotValue, missions: readonly GridMission[]): string {
  if (slot.kind === 'empty') return LABELS.cra.nothing;
  if (slot.kind === 'absence') return LABELS.cra.absence;

  return missions.find((mission) => mission.missionId === slot.missionId)?.name ?? slot.missionId;
}

interface CraSlotControlProps {
  readonly day: string;
  readonly slotIndex: 0 | 1;
  readonly value: SlotValue;
  readonly missions: readonly GridMission[];
  readonly editable: boolean;
  readonly onChange: (value: SlotValue) => void;
  readonly onNavigate: (direction: NavigationDirection) => void;
  readonly registerRef: (element: HTMLSelectElement | null) => void;
}

export function CraSlotControl({
  day,
  slotIndex,
  value,
  missions,
  editable,
  onChange,
  onNavigate,
  registerRef,
}: CraSlotControlProps): ReactElement {
  if (!editable) {
    return (
      <span className="text-sm">
        {value.kind === 'empty' ? LABELS.cra.nothing : labelForSlot(value, missions)}
      </span>
    );
  }

  const inputId = `cra-slot-${day}-${String(slotIndex)}`;
  const slotWord = slotIndex === 0 ? LABELS.cra.morning : LABELS.cra.afternoon;

  return (
    <>
      <label className="sr-only" htmlFor={inputId}>
        {frenchDate(day)} — {slotWord}
      </label>
      <select
        id={inputId}
        ref={registerRef}
        value={optionValue(value)}
        onChange={(event) => {
          onChange(slotToValue(event.target.value));
        }}
        onKeyDown={(event) => {
          // ArrowUp/ArrowDown must be suppressed: a closed, focused native <select> otherwise
          // cycles its own options on those keys, which would fight "flèches entre créneaux"
          // (ADR-0068). ArrowLeft/ArrowRight carry no such native behaviour here.
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
          }
        }}
        className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <option value={EMPTY_OPTION}>{LABELS.cra.nothing}</option>
        <option value={ABSENCE_OPTION}>{LABELS.cra.absence}</option>
        {missions.map((mission) => (
          <option key={mission.missionId} value={mission.missionId}>
            {mission.name}
          </option>
        ))}
      </select>
    </>
  );
}
