/**
 * Package 09 (P1 audit): re-exported from `@erp/contracts` rather than hand-duplicated — the
 * single description now lives in `packages/contracts/src/cra.ts`, shared with
 * `apps/api/src/routes/cra.ts`. That file also carries the confirmed-against-the-route-handler
 * history this file used to hold.
 *
 * `ValidationResponse.invoices` is `ValidationInvoiceItem[]`, not `InvoiceListItem[]` — a real gap
 * package 09 found: `POST /api/v1/cras/:id/validation` never runs the Rank A7 enrichment
 * (`consultantName`/`missionNames`/`lineCount`/`createdAt`) `GET /api/v1/invoices` and
 * `GET /api/v1/pre-facturier` both add. The pre-move type here claimed those four fields anyway;
 * `packages/contracts/src/cra.ts` names why and confirms no component ever read them.
 */
export type {
  ConsultantRosterResponse,
  CraDetail,
  CraFlag,
  CraGridResponse,
  CraLine,
  CraListItem,
  CraListResponse,
  CraStatus,
  DeclinedDay,
  GridDay,
  GridMission,
  ManagerCraGridResponse,
  MonthEntriesRequest,
  MonthEntriesResponse,
  MonthEntry,
  NonWorkableReason,
  RecordedDayType,
  RefusalResponse,
  ValidationInvoiceItem,
  ValidationResponse,
} from '@erp/contracts';
