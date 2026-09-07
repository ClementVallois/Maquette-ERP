import { describe, expect, it } from 'vitest';

import { invoiceDestination } from './destination.ts';

/**
 * The property worth holding is not the shape of the object — TypeScript already holds that — but
 * that the row's own `Link` and `DataTable`'s `onRowActivate` cannot drift apart: they call this,
 * and there is only one of it. What a reader would see go wrong is a tap opening a different
 * invoice, or the same invoice with the back link pointing at the wrong list, than the "Ouvrir"
 * link on that same row.
 */
const ROW = { id: 'invoice-7', billedToName: 'Groupe Delta', supplyPeriod: '2026-07' };

describe('invoiceDestination', () => {
  it('addresses the row it is given, and carries the list to return to', () => {
    expect(invoiceDestination(ROW, '/factures')).toEqual({
      to: '/factures/$id',
      params: { id: 'invoice-7' },
      search: { client: 'Groupe Delta', period: '2026-07', from: '/factures' },
    });
  });

  it('is a pure function of the row and the return route — the same row from two lists differs only in `from`', () => {
    const fromList = invoiceDestination(ROW, '/factures');
    const fromPreFacturier = invoiceDestination(ROW, '/pre-facturier');

    expect(fromPreFacturier.params).toEqual(fromList.params);
    expect(fromPreFacturier.search.client).toBe(fromList.search.client);
    expect(fromPreFacturier.search.period).toBe(fromList.search.period);
    expect(fromPreFacturier.search.from).not.toBe(fromList.search.from);
  });
});
