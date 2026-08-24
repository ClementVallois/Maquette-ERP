import type { InvoiceListItem } from '@/features/factures/types';

/**
 * `Annexe A — Timesheet`. Shapes verified against the route handlers themselves
 * (`apps/api/src/routes/api.ts`, `GET /api/v1/cras`, `GET /api/v1/cras/:id`), not guessed from the
 * prose (frontend-plan.md rule 0bis.8) — the response object literals there are read directly, and
 * the domain types they are built from (`packages/timesheet/src/domain/cra-line.ts`'s `CraLine`,
 * `packages/timesheet/src/domain/submission-checks.ts`'s `CraFlag`,
 * `packages/timesheet/src/domain/cra-status.ts`'s `CRA_STATUSES`) confirm the field names and the
 * literal unions.
 *
 * Only `types.ts` exists for this feature in Phase 3 (frontend-plan.md task 3.7: "do not build
 * ahead of the endpoints") — `api.ts`/`hooks.ts` land with the screen that first calls each
 * endpoint (Phase 6 for the grid write path, Phase 7 for validation). `GET /api/v1/cras/:period/grid`
 * does not exist yet (Phase 5.2); its shape is not written here at all rather than guessed.
 */

export type CraStatus = 'draft' | 'submitted' | 'refused' | 'validated';

export interface CraListItem {
  readonly id: string;
  readonly consultantId: string;
  readonly officeId: string;
  readonly period: string;
  readonly status: CraStatus;
  readonly recordedHalfDays: number;
}

export interface CraListResponse {
  readonly cras: readonly CraListItem[];
}

export type RecordedDayType = 'worked' | 'absence';

export interface CraLine {
  readonly day: string;
  readonly dayType: RecordedDayType;
  readonly missionId: string | null;
  readonly halfDays: 1 | 2;
}

export type NonWorkableReason = 'weekend' | 'publicHoliday';

export interface CraFlag {
  readonly day: string;
  readonly reason: NonWorkableReason;
}

/**
 * The Cra detail (`GET /api/v1/cras/:id`) — one of the two "complex payloads" frontend-plan.md
 * task 3.7 names for optional zod parsing at the fetch boundary. Not written here: the parser
 * belongs in this feature's `api.ts`, which does not exist yet in Phase 3. This interface is the
 * shape it will validate against.
 */
export interface CraDetail {
  readonly id: string;
  readonly consultantId: string;
  readonly officeId: string;
  readonly period: string;
  readonly status: CraStatus;
  readonly lines: readonly CraLine[];
  readonly flags: readonly CraFlag[];
  readonly validatedBy: string | null;
}

export interface MonthEntry {
  readonly day: string;
  readonly dayType: RecordedDayType;
  readonly missionId: string | null;
}

export interface MonthEntriesRequest {
  readonly submit: boolean;
  readonly entries: readonly MonthEntry[];
}

export interface MonthEntriesResponse {
  readonly craId: string;
  readonly status: CraStatus;
  readonly flags: readonly CraFlag[];
}

export interface DeclinedDay {
  readonly craId: string;
  readonly missionId: string;
  readonly halfDays: number;
  readonly reason: 'notRegie' | 'unknownMission' | 'noAgreedRate' | 'unknownClient';
}

/**
 * The one place this feature names a **billing** shape, and the arrow is deliberate rather than
 * convenient: `POST /api/v1/cras/:id/validation` genuinely answers with the invoices the
 * validation drafted (ADR-0038 — one validation drafts one invoice per client), because the
 * composition root is what holds both modules and hands the caller the result of the whole chain.
 * `InvoiceListItem` therefore lives in `features/factures/types.ts`, which owns the invoice, and
 * is imported here — never the reverse. `features/factures` names nothing from this feature, which
 * is the direction that matters: it is the arrow `docs/adr/0001` and the CI boundary rule forbid
 * between the sealed packages, and the SPA's feature folders do not get to invert it for
 * convenience just because dependency-cruiser only polices `packages/`.
 * See `docs/open-questions.md`, row of 24/08/2026.
 */
export interface ValidationResponse {
  readonly craId: string;
  readonly replayed: boolean;
  readonly invoices: readonly InvoiceListItem[];
  readonly declined: readonly DeclinedDay[];
}
