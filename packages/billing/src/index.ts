export {
  type Client,
  client,
  isFrench,
  isValidSiren,
  type PostalAddress,
  TERRITORIALITIES,
  type Territoriality,
} from './domain/client.ts';
export { NoVatRateError } from './domain/errors.ts';
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
