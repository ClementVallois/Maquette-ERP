/**
 * Package 09 (P1 audit): `GET /api/v1/assignments`, `POST /api/v1/assignments`, and
 * `PUT /api/v1/assignments/:id` — the shape both `apps/api/src/staffing/assignment-admin.ts` and
 * `apps/web/src/features/affectations/types.ts` now share, moved verbatim from the SPA's own
 * hand-typed copy.
 */
export interface AssignmentInput {
  readonly consultantId: string;
  readonly missionId: string;
  readonly fromDate: string;
  readonly toDate: string | null;
}

export interface Assignment extends AssignmentInput {
  readonly id: string;
  readonly consultantName: string;
  readonly missionName: string;
  readonly clientName: string;
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

/** The success half of a create/update: `AssignmentWriteOutcome`'s `notFound`/`refused` members
 * are never sent as a 2xx body — they become a `ProblemDetails` instead (`sendProblem`). */
export interface AssignmentSaved {
  readonly kind: 'saved';
  readonly id: string;
}
