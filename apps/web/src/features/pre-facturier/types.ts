/**
 * Package 09 (P1 audit): re-exported from `@erp/contracts` rather than hand-duplicated — the
 * single description now lives in `packages/contracts/src/pre-facturier.ts`, shared with
 * `apps/api/src/routes/pre-facturier.ts`. That file also carries the confirmed-against-the-route
 * history this file used to hold.
 */
export type {
  DeclineReason,
  PreFacturierCraRow,
  PreFacturierInvoiceRow,
  PreFacturierResponse,
  PreFacturierSummary,
} from '@erp/contracts';
