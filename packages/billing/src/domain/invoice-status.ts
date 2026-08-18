/**
 * Three, and only three. `cancelledByCreditNote` is the name `CONTEXT.md` fixes: the enum follows
 * the vocabulary file, never the other way round. It replaces `credited`, which described the
 * effect on the client's account rather than what happened to this document.
 */
export const INVOICE_STATUSES = ['draft', 'issued', 'cancelledByCreditNote'] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
