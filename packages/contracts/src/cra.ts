import type { InvoiceListItem } from './invoices.ts';
import type { DeclineReason } from './pre-facturier.ts';

/**
 * Timesheet — the shape both `apps/api/src/routes/cra.ts` and `apps/web/src/features/cra/types.ts`
 * read from here, rather than each restating it.
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
  /** When the current status was reached; `null` for a `draft` never submitted. */
  readonly statusChangedAt: string | null;
}

export interface CraListResponse {
  readonly cras: readonly CraListItem[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/** `GET /api/v1/consultants` — a manager's own office roster, consultants
 * only (never the manager asking, never another office). Manager alone: ADR-0077 rejects granting
 * it to a billing persona, and `api.int.test.ts` asserts the 403. */
export interface ConsultantRosterResponse {
  readonly consultants: readonly { readonly id: string; readonly displayName: string }[];
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

/** The Cra detail (`GET /api/v1/cras/:id`). */
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
 * `GET /api/v1/cras/:period/grid` — verified against the **route's own object literal**, not
 * against the composition it remaps: `missions[].missionId` (not `.id`), the calendar-skeleton
 * `days: GridDay[]` (absent from the composition), `validatedBy` and `missions[].assignableDays`
 * (ADR-0069/ADR-0070) all cross at the route, not the composition boundary.
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
  readonly refusal: { readonly reason: string; readonly at: string; readonly by: string } | null;
  /** The domain's own answer (ADR-0065): never re-derived from `status` in this SPA. */
  readonly editable: boolean;
  readonly validatedBy: string | null;
  readonly timeline: readonly {
    readonly kind: 'submitted' | 'refused' | 'validated';
    readonly at: string;
    readonly actorName: string;
    readonly detail?: string;
  }[];
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

export interface DeclinedDay {
  readonly craId: string;
  readonly missionId: string;
  readonly quarterDays: number;
  readonly reason: DeclineReason;
}

/**
 * `POST /api/v1/cras/:id/validation` — genuinely answers with the invoices the validation
 * drafted (ADR-0038 — one validation drafts one invoice per client), because the composition root
 * is what holds both modules and hands the caller the result of the whole chain. This is the one
 * place a `timesheet`-resource file in this shared contract names a `billing` one, mirroring the
 * one arrow the composition root itself has (ADR-0038), never the reverse.
 *
 * **Narrower than `./invoices.ts`'s own `InvoiceListItem`, on purpose — a real gap this move
 * found, not a stylistic choice.** `validateCraAndDraftInvoices` (`apps/api/src/chain/
 * validate-cra.ts`) answers `@erp/billing`'s plain domain `InvoiceListItem`: it never runs the
 * Rank A7 enrichment (`consultantName`/`missionNames`/`lineCount`/`createdAt`) that
 * `GET /api/v1/invoices` and `GET /api/v1/pre-facturier` both add at their own route/composition
 * layer. The pre-move SPA type claimed those four fields anyway (inherited from `InvoiceListItem`
 * via one shared type for all three responses) — untested and unread by any component
 * (`validate-result-dialog.tsx` only ever touches `id`/`billedToName`/`status`/`totalTtcCents`),
 * so the mistake never manifested, but it was still a promise the server does not keep. Fixed
 * here, not by enriching the route to match the old claim: that would be a behavior change,
 * which a DTO-sharing package does not make silently.
 */
export type ValidationInvoiceItem = Omit<
  InvoiceListItem,
  'consultantName' | 'missionNames' | 'lineCount' | 'createdAt'
>;

export interface ValidationResponse {
  readonly craId: string;
  readonly replayed: boolean;
  readonly invoices: readonly ValidationInvoiceItem[];
  readonly declined: readonly DeclinedDay[];
}

/**
 * `POST /api/v1/cras/:id/refusal` — `status` is always `'refused'` on a 200, but the wider
 * `CraStatus` is kept rather than the single literal, so a caller that reads it after another
 * fetch (e.g. re-reading `GET /api/v1/cras/:id`) is not narrowed to a value that can go stale.
 */
export interface RefusalResponse {
  readonly craId: string;
  readonly status: CraStatus;
}
