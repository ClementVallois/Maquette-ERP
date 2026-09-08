/**
 * Re-exported from `@erp/contracts` rather than hand-duplicated — the single description lives
 * in `packages/contracts/src/invoices.ts`, shared with `apps/api/src/routes/invoices.ts`. That
 * file also says why `InvoiceListItem` lives there rather than with `cra` or `pre-facturier`, and
 * why `dueDate` is deliberately absent.
 */
export type {
  BilledParty,
  DenseMonthBillable,
  DocumentTotals,
  EarlyPaymentDiscount,
  InvoiceDetail,
  InvoiceHistoryResponse,
  InvoiceLine,
  InvoiceLineage,
  InvoiceListItem,
  InvoiceListResponse,
  InvoiceStatus,
  InvoiceYearStatusCount,
  IssuanceResponse,
  LegalMentions,
  NotChargedReason,
  OperationCategory,
  PaymentTerms,
  PostalAddress,
  RegieDaysOrigin,
  Seller,
  VatGroup,
  VatTreatment,
} from '@erp/contracts';
