/**
 * The fields a row needs to address one invoice. Structural rather than a named row type: the
 * invoice list and the pré-facturier's "billable" table carry different rows
 * (`InvoiceListItem`, `PreFacturierInvoiceRow`) and both open the same screen.
 */
interface InvoiceRowReference {
  readonly id: string;
  readonly billedToName: string;
  readonly supplyPeriod: string;
}

interface InvoiceDestination {
  readonly to: '/factures/$id';
  readonly params: { readonly id: string };
  readonly search: { readonly client: string; readonly period: string; readonly from: string };
}

/**
 * The one destination a table row can open, shared between the row's own `Link` (the keyboard and
 * screen-reader path) and `DataTable`'s `onRowActivate` (the pointer-tap convenience on top of
 * it) — one place, so the two can never point two different directions. It is one place across
 * screens, too: the same helper existed byte-identically in both callers, each documented as the
 * single source it was not.
 *
 * `from` is what the invoice screen's own back link reads to return the visitor to the list they
 * came from, which is why it is the caller's route rather than a constant.
 */
export function invoiceDestination(row: InvoiceRowReference, returnTo: string): InvoiceDestination {
  return {
    to: '/factures/$id',
    params: { id: row.id },
    search: { client: row.billedToName, period: row.supplyPeriod, from: returnTo },
  };
}
