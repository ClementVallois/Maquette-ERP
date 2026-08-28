import type { QuarterDays } from '@erp/platform';

import type { MissionId } from './ids.ts';

/**
 * Why a quarter-day a validated Cra carried produced no invoice line (ADR-0037).
 *
 * It sits in the domain rather than beside the drafting function that produces it, because the
 * repository port names it too — and `domain/` may not import `application/`. That the reason is
 * a closed list is the point: days that vanish with no record leave a reader unable to tell
 * whether they were considered or dropped.
 */
export const DECLINE_REASONS = [
  'notRegie',
  'unknownMission',
  'noAgreedRate',
  'unknownClient',
] as const;

export type DeclineReason = (typeof DECLINE_REASONS)[number];

export interface DeclinedDays {
  readonly missionId: MissionId;
  readonly quarterDays: QuarterDays;
  readonly reason: DeclineReason;
}
