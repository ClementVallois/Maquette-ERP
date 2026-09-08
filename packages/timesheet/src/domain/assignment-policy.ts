import { toDayNumber, type IsoDate } from '@erp/platform';

export interface AssignmentPolicyInput {
  readonly from: IsoDate;
  readonly to: IsoDate | null;
  readonly departureDate: IsoDate | null;
  readonly mission: {
    readonly startDate: IsoDate;
    readonly endDate: IsoDate | null;
    readonly requiredHabilitations: readonly string[];
  };
  readonly heldHabilitations: readonly {
    readonly id: string;
    readonly from: IsoDate;
    readonly to: IsoDate | null;
  }[];
}

export type AssignmentPolicyRefusal =
  | { readonly kind: 'invalidRange'; readonly from: IsoDate; readonly to: IsoDate }
  | { readonly kind: 'departure'; readonly departureDate: IsoDate }
  | {
      readonly kind: 'missionDates';
      readonly missionStartDate: IsoDate;
      readonly missionEndDate: IsoDate | null;
    }
  | { readonly kind: 'missingHabilitations'; readonly ids: readonly string[] };

export function assignmentIntervalOrder(
  from: IsoDate,
  to: IsoDate | null,
): Extract<AssignmentPolicyRefusal, { readonly kind: 'invalidRange' }> | null {
  return to !== null && to < from ? { kind: 'invalidRange', from, to } : null;
}

const openEnd = (date: IsoDate | null): number =>
  date === null ? Number.POSITIVE_INFINITY : toDayNumber(date);

function fullyCovers(
  periods: readonly { readonly from: IsoDate; readonly to: IsoDate | null }[],
  from: IsoDate,
  to: IsoDate | null,
): boolean {
  const targetFrom = toDayNumber(from);
  const targetTo = openEnd(to);
  const sorted = periods
    .map((period) => ({ from: toDayNumber(period.from), to: openEnd(period.to) }))
    .sort((left, right) => left.from - right.from);

  let coveredThrough = targetFrom - 1;
  for (const period of sorted) {
    if (period.from > coveredThrough + 1) return false;
    coveredThrough = Math.max(coveredThrough, period.to);
    if (coveredThrough >= targetTo) return true;
  }
  return coveredThrough >= targetTo;
}

export function assignmentPolicy(input: AssignmentPolicyInput): AssignmentPolicyRefusal | null {
  const invalidRange = assignmentIntervalOrder(input.from, input.to);
  if (invalidRange !== null) return invalidRange;

  if (
    input.departureDate !== null &&
    (input.from >= input.departureDate || input.to === null || input.to >= input.departureDate)
  ) {
    return { kind: 'departure', departureDate: input.departureDate };
  }

  const missionEndsBeforeAssignment =
    input.mission.endDate !== null &&
    (input.from > input.mission.endDate || input.to === null || input.to > input.mission.endDate);
  if (input.from < input.mission.startDate || missionEndsBeforeAssignment) {
    return {
      kind: 'missionDates',
      missionStartDate: input.mission.startDate,
      missionEndDate: input.mission.endDate,
    };
  }

  const missing = input.mission.requiredHabilitations.filter(
    (id) =>
      !fullyCovers(
        input.heldHabilitations
          .filter((habilitation) => habilitation.id === id)
          .map((habilitation) => ({ from: habilitation.from, to: habilitation.to })),
        input.from,
        input.to,
      ),
  );
  return missing.length === 0 ? null : { kind: 'missingHabilitations', ids: missing };
}
