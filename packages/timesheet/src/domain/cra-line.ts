import {
  quarterDays as toQuarterDays,
  type QuarterDays,
  InvalidValueError,
  type IsoDate,
} from '@erp/platform';

import type { RecordedDayType } from './day-type.ts';
import { MissionOnNonWorkedDayError, MissionRequiredError } from './errors.ts';
import type { MissionId } from './ids.ts';

/**
 * One entry of a `Cra`: a part of a day, on one mission when it is worked.
 *
 * A day can carry more than one line — a quarter of audit on one mission, a quarter on another —
 * which is why the mission sits on the line and not on the day. The quantity is a count of
 * quarter-days (ADR-0069), so a line is one to four of them and never anything else.
 */
export interface CraLine {
  readonly day: IsoDate;
  readonly dayType: RecordedDayType;
  readonly missionId: MissionId | null;
  readonly quarterDays: QuarterDays;
}

export function craLine(input: {
  day: IsoDate;
  dayType: RecordedDayType;
  missionId: MissionId | null;
  quarterDays: number;
}): CraLine {
  const quantity = toQuarterDays(input.quarterDays);
  if (quantity < 1 || quantity > 4) {
    throw new InvalidValueError(
      'craLine.quarterDays',
      input.quarterDays,
      'one to four quarter-days',
    );
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
    quarterDays: quantity,
  };
}
