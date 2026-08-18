import { describe, expect, it } from 'vitest';

import { client } from './client.ts';
import { NoVatRateError } from './errors.ts';
import { applyRate } from './money.ts';
import { parisClient, reunionClient } from './testing/march-2026.ts';
import { NOT_CHARGED_MENTIONS, resolveVat, vatGroupKey } from './vat.ts';

const ON = '2026-03-31';

function clientIn(territoriality: Parameters<typeof client>[0]['territoriality'], vat?: string) {
  return client({
    id: 'client-x',
    name: 'Client X',
    siren: territoriality === 'europeanUnion' ? null : '552100554',
    intraCommunityVatNumber: vat ?? null,
    territoriality,
    billingAddress: parisClient.billingAddress,
  });
}

describe('resolving VAT', () => {
  it('charges the metropolitan standard rate in mainland France', () => {
    expect(
      resolveVat({ serviceNature: 'consultingService', client: parisClient, on: ON }),
    ).toStrictEqual({ kind: 'taxable', basisPoints: 2000 });
  });

  it('charges 8,5 % in La Réunion, which is what proves the rate is not hard-coded', () => {
    expect(
      resolveVat({ serviceNature: 'consultingService', client: reunionClient, on: ON }),
    ).toStrictEqual({ kind: 'taxable', basisPoints: 850 });
  });

  it('charges nothing in Guyane and Mayotte, and says it is out of scope rather than zero', () => {
    // ADR-0010, and the distinction the whole type exists for: 0 % is a rate, "outside the scope
    // of the tax" is not. They print different mentions and are declared differently.
    const treatment = resolveVat({
      serviceNature: 'consultingService',
      client: clientIn('overseasOutsideVatScope'),
      on: ON,
    });

    expect(treatment).toStrictEqual({ kind: 'notCharged', reason: 'territoryOutsideVatScope' });
    expect(NOT_CHARGED_MENTIONS.territoryOutsideVatScope).toContain('294-1');
  });

  it('reverse-charges a taxable customer in another member state', () => {
    const treatment = resolveVat({
      serviceNature: 'consultingService',
      client: clientIn('europeanUnion', 'DE811569869'),
      on: ON,
    });

    expect(treatment).toStrictEqual({ kind: 'notCharged', reason: 'reverseChargeEuB2b' });
    expect(NOT_CHARGED_MENTIONS.reverseChargeEuB2b).toContain('Autoliquidation');
  });

  it('charges French VAT to an EU customer that is not a taxable person', () => {
    // The status of the customer, which is the input a rate table keyed on country alone loses.
    // No intra-EU VAT number means no reverse charge, and the place of supply is France.
    expect(
      resolveVat({ serviceNature: 'consultingService', client: clientIn('europeanUnion'), on: ON }),
    ).toStrictEqual({ kind: 'taxable', basisPoints: 2000 });
  });

  it('refuses a date the reference does not cover, rather than inventing a rate', () => {
    expect(() =>
      resolveVat({ serviceNature: 'consultingService', client: parisClient, on: '2013-12-31' }),
    ).toThrow(NoVatRateError);
  });
});

describe('grouping for the recapitulative', () => {
  it('puts two lines at the same rate in one group', () => {
    expect(vatGroupKey({ kind: 'taxable', basisPoints: 2000 })).toBe(
      vatGroupKey({ kind: 'taxable', basisPoints: 2000 }),
    );
  });

  it('separates two rates, and separates two reasons for carrying none', () => {
    const keys = [
      vatGroupKey({ kind: 'taxable', basisPoints: 2000 }),
      vatGroupKey({ kind: 'taxable', basisPoints: 850 }),
      vatGroupKey({ kind: 'notCharged', reason: 'territoryOutsideVatScope' }),
      vatGroupKey({ kind: 'notCharged', reason: 'reverseChargeEuB2b' }),
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never collides a rate of zero with an operation outside the scope of the tax', () => {
    // The two the model refuses to conflate, asserted on the key that would have merged them.
    expect(vatGroupKey({ kind: 'taxable', basisPoints: 0 })).not.toBe(
      vatGroupKey({ kind: 'notCharged', reason: 'territoryOutsideVatScope' }),
    );
    expect(applyRate(100_000, 0)).toBe(0);
  });
});
