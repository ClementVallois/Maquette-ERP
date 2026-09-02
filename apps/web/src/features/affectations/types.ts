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
