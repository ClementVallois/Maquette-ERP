export const INVOICE_STATUSES = ['draft', 'issued', 'credited'] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
