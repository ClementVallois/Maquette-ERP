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
  /**
   * Added for ADR-0071: a manager's row needs a name to pick a consultant by. Presentation, not a
   * rule — resolved server-side the same way `preFacturierComposition` already resolves it. A
   * consultant's own rows carry their own name back; harmless, and one shape for every role rather
   * than a field that exists only for `manager`.
   */
  readonly consultantName: string;
  readonly officeId: string;
  readonly period: string;
  readonly status: CraStatus;
  readonly recordedQuarterDays: number;
}

export interface CraListResponse {
  readonly cras: readonly CraListItem[];
}

export type RecordedDayType = 'worked' | 'absence';

export interface CraLine {
  readonly day: string;
  readonly dayType: RecordedDayType;
  readonly missionId: string | null;
  readonly quarterDays: 1 | 2 | 3 | 4;
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
  readonly quarterDays: number;
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

/**
 * `GET /api/v1/cras/:period/grid` (front-end plan Phase 5.2) — verified against the **route's own
 * object literal** (`apps/api/src/routes/api.ts`, the `days`/`missions.map`/`return` block at the
 * end of the handler), not against `composition/cra-grid.ts`'s `CraGridComposition`: the route
 * remaps the composition before answering, and three differences matter enough to name here rather
 * than let a reader assume the two are the same shape.
 *
 * - `missions[].missionId`, not `.id` — the composition's `GridMission.id` becomes `missionId` on
 *   the wire.
 * - `days: GridDay[]` exists on the wire and not on the composition at all: it is the calendar
 *   skeleton (`gridDaysSkeleton` in `routes/api.ts`), computed at the route from the same
 *   `workingCalendar()` the domain uses, independently of whether the consultant recorded anything
 *   that day.
 * - **`validatedBy`.** Task 5bis.5 (ADR-0069) closed the gap `docs/open-questions.md` named on
 *   25/08/2026: the composition now carries it and the route adds it, so a `validated` grid's
 *   banner can name who validated it from this endpoint alone.
 * - **`missions[].assignableDays`.** Added the same task: the days of the month this consultant is
 *   staffed on this mission, so the matrix (ADR-0070) can grey out a day rather than let a write
 *   fail at submission.
 */
export interface GridDay {
  readonly date: string;
  readonly nonWorkable: NonWorkableReason | null;
}

export interface GridMission {
  readonly missionId: string;
  readonly name: string;
  readonly clientName: string;
  readonly assignableDays: readonly string[];
}

export interface CraGridResponse {
  readonly period: string;
  /** `null` until the month has been saved once: there is no record to print yet. */
  readonly craId: string | null;
  readonly status: CraStatus | null;
  readonly days: readonly GridDay[];
  readonly missions: readonly GridMission[];
  readonly lines: readonly CraLine[];
  readonly flags: readonly CraFlag[];
  readonly refusal: { readonly reason: string } | null;
  /** The domain's own answer (ADR-0065): never re-derived from `status` in this SPA. */
  readonly editable: boolean;
  readonly validatedBy: string | null;
}

/**
 * `GET /api/v1/consultants/:consultantId/cras/:period/grid` (ADR-0071, manager-only). The same
 * wire shape `CraGridResponse` answers, plus the two fields only this route carries — the
 * consultant route's caller already knows who they are. `editable` still means "could the
 * consultant edit this"; the manager screen ignores it and never renders an input (ADR-0071's own
 * decision — a manager never edits a consultant's CRA).
 */
export interface ManagerCraGridResponse extends CraGridResponse {
  readonly consultantId: string;
  readonly consultantName: string;
}

/** `GET /api/v1/calendar` — the working calendar's own year coverage (ADR-0004). */
export interface CalendarResponse {
  readonly years: readonly number[];
}

export interface DeclinedDay {
  readonly craId: string;
  readonly missionId: string;
  readonly quarterDays: number;
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

/**
 * `POST /api/v1/cras/:id/refusal` (Phase 7, task 7.3) — verified against the route itself
 * (`apps/api/src/routes/api.ts`), added the same phase this type is first consumed: Annexe A never
 * listed this endpoint (`docs/open-questions.md`, row dated 25/08/2026), so there was nothing to
 * transcribe from prose. `status` is always `'refused'` on a 200 — the route never answers any
 * other value — but the wider `CraStatus` is kept rather than the single literal, so a caller that
 * reads it after another fetch (e.g. re-reading `GET /api/v1/cras/:id`) is not narrowed to a value
 * that can go stale.
 */
export interface RefusalResponse {
  readonly craId: string;
  readonly status: CraStatus;
}
