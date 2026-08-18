import {
  halfDays as toHalfDays,
  type HalfDays,
  InvalidValueError,
  type IsoDate,
} from '@erp/platform';

import type { RecordedDayType } from './day-type.ts';
import { MissionOnNonWorkedDayError, MissionRequiredError } from './errors.ts';
import type { MissionId } from './ids.ts';

/**
 * One entry of a `Cra`: a part of a day, on one mission when it is worked.
 *
 * A day can carry more than one line — half a day of audit on one mission, half a day on another —
 * which is why the mission sits on the line and not on the day. The quantity is a count of
 * half-days (ADR-0012), so a line is one or two of them and never anything else.
 */
export interface CraLine {
  readonly day: IsoDate;
  readonly dayType: RecordedDayType;
  readonly missionId: MissionId | null;
  readonly halfDays: HalfDays;
}

export function craLine(input: {
  day: IsoDate;
  dayType: RecordedDayType;
  missionId: MissionId | null;
  halfDays: number;
}): CraLine {
  const quantity = toHalfDays(input.halfDays);
  if (quantity < 1 || quantity > 2) {
    throw new InvalidValueError('craLine.halfDays', input.halfDays, 'one or two half-days');
  }

  if (input.dayType === 'worked' && input.missionId === null) {
    throw new MissionRequiredError(input.day);
  }
  if (input.dayType !== 'worked' && input.missionId !== null) {
    throw new MissionOnNonWorkedDayError(input.day, input.dayType);
  }

  return {
    day: input.day,
    dayType: input.dayType,
    missionId: input.missionId,
    halfDays: quantity,
  };
}
