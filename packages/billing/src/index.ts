export {
  type Client,
  client,
  isFrench,
  isValidSiren,
  type PostalAddress,
  TERRITORIALITIES,
  type Territoriality,
} from './domain/client.ts';
export type { ClientId, ConsultantId, InvoiceId, MissionId, OfficeId } from './domain/ids.ts';
export { INVOICE_STATUSES, type InvoiceStatus } from './domain/invoice-status.ts';
export {
  BILLING_MODELS,
  type BillingModel,
  type BillingReference,
  billingReference,
  type CommercialMission,
  commercialMission,
} from './domain/reference.ts';
