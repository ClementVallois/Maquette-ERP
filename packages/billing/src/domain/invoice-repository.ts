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
  /**
   * Internal invariant check — returns whether any invoice has already been drafted from this CRA.
   * Not office-scoped: it is a boolean, exposes no data, and scoping it would let a replayed event
   * draft duplicates in another office's transaction (ADR-0021).
   */
  hasCraBeenProcessed(craId: string): Promise<boolean>;
}
