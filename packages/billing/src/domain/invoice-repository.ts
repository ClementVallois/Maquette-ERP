import type { InvoiceId, OfficeId } from './ids.ts';
import type { Invoice } from './invoice.ts';

export interface InvoiceListItem {
  readonly id: InvoiceId;
  readonly status: string;
  readonly supplyPeriod: string;
  readonly billedToName: string;
  readonly invoiceNumber: string | null;
  readonly issueDate: string | null;
  readonly totalTtcCents: number | null;
}

export interface InvoiceListQuery {
  readonly officeId: OfficeId;
  readonly limit: number;
  readonly offset: number;
}

export interface InvoiceRepository {
  findById(id: InvoiceId, actor: { officeId: OfficeId }): Promise<Invoice | null>;
  list(query: InvoiceListQuery): Promise<readonly InvoiceListItem[]>;
  save(invoice: Invoice): Promise<void>;
  saveDraft(invoice: Invoice, craId: string): Promise<void>;
}
