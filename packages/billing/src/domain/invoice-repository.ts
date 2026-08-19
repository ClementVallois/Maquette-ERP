import type { Actor } from '@erp/platform';

import type { InvoiceId } from './ids.ts';
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
  readonly actor: Actor;
  readonly limit: number;
  readonly offset: number;
}

export interface InvoiceRepository {
  /**
   * `null` means there is no such invoice; an invoice that exists and is out of reach raises
   * `OutOfScopeError` (ADR-0003, ADR-0023).
   */
  findById(id: InvoiceId, actor: Actor): Promise<Invoice | null>;
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
