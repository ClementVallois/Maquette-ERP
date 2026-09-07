/**
 * The web-side twin of `apps/api/src/staffing/staffing-snapshot.ts`'s own
 * `INTERCONTRAT_MISSION_NAME` — the discriminator the manager staffing chart's deep link
 * (`?staffing=on-mission|intercontrat`) has to replicate client-side, since `apps/web` may not
 * import across the api/web boundary. Kept as a name match, not a shared constant, on purpose.
 */
export const INTERCONTRAT_MISSION_NAME = 'Intercontrat';

export interface Assignment {
  readonly id: string;
  readonly consultantId: string;
  readonly consultantName: string;
  readonly missionId: string;
  readonly missionName: string;
  readonly clientName: string;
  readonly fromDate: string;
  readonly toDate: string | null;
}

export interface AssignmentInput {
  readonly consultantId: string;
  readonly missionId: string;
  readonly fromDate: string;
  readonly toDate: string | null;
}

export interface AssignmentCatalogue {
  readonly today: string;
  readonly assignments: readonly Assignment[];
  readonly consultants: readonly {
    readonly id: string;
    readonly name: string;
    readonly departureDate: string | null;
  }[];
  readonly missions: readonly {
    readonly id: string;
    readonly name: string;
    readonly clientName: string;
    readonly startDate: string;
    readonly endDate: string | null;
    readonly requiredHabilitations: readonly string[];
  }[];
}

export interface AssignmentSaved {
  readonly kind: 'saved';
  readonly id: string;
}
