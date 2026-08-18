export {
  type Client,
  client,
  isFrench,
  isValidSiren,
  type PostalAddress,
  TERRITORIALITIES,
  type Territoriality,
} from './domain/client.ts';
export {
  EmptyInvoiceError,
  InvalidSequenceError,
  InvoiceTransitionError,
  LineOutsideInvoicePeriodError,
  NoVatRateError,
  PaymentTermsTooLongError,
  ValidatorCannotIssueError,
} from './domain/errors.ts';
export type {
  ClientId,
  ConsultantId,
  CraId,
  InvoiceId,
  MissionId,
  OfficeId,
} from './domain/ids.ts';
export {
  type InvoiceLine,
  type LineOrigin,
  regieLine,
  type RegieDaysOrigin,
} from './domain/invoice-line.ts';
export { INVOICE_STATUSES, type InvoiceStatus } from './domain/invoice-status.ts';
export {
  BILLING_MODELS,
  type BillingModel,
  type BillingReference,
  billingReference,
  type CommercialMission,
  commercialMission,
} from './domain/reference.ts';
export {
  NOT_CHARGED_MENTIONS,
  NOT_CHARGED_REASONS,
  type NotChargedReason,
  resolveVat,
  SERVICE_NATURES,
  type ServiceNature,
  vatGroupKey,
  type VatTreatment,
} from './domain/vat.ts';
export {
  type BilledParty,
  billedParty,
  Invoice,
  type InvoiceTotals,
  type VatGroup,
} from './domain/invoice.ts';
export {
  type EarlyPaymentDiscount,
  type LegalMentions,
  legalMentions,
  MINIMUM_LATE_PAYMENT_BASIS_POINTS,
  OPERATION_CATEGORIES,
  type OperationCategory,
  RECOVERY_INDEMNITY_CENTS,
} from './domain/mentions.ts';
export {
  dueDate,
  MAX_END_OF_MONTH_DAYS,
  MAX_NET_DAYS,
  type PaymentTerms,
  paymentTerms,
} from './domain/payment-terms.ts';
export { type LegalEntity, legalEntity } from './domain/seller.ts';
export { documentNumber, sameSeries, type SeriesKey, seriesKeyOf } from './domain/numbering.ts';
