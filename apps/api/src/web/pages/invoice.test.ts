import {
  billedParty,
  client,
  Invoice,
  legalEntity,
  legalMentions,
  paymentTerms,
  regieLine,
} from '@erp/billing';
import { period } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { frenchDays, frenchEuros } from '../format.ts';
import { renderToString } from '../render/html.ts';

import { invoicePage } from './invoice.ts';

/**
 * F03: the printable used to convert quantity to days while keeping the *quarter-day* price next
 * to it — "21 j × 180,00 €" reading as if 180 € were the daily rate, when the line is actually
 * 21 j × 720 €/j. This protects the paired units and the amount on both a whole-day line and a
 * fractional-day one, so a regression back to the mixed-unit multiplication fails here rather than
 * only being noticed by a reader doing mental arithmetic on a printed page.
 */

const fixtureClient = client({
  id: 'f03-client',
  name: 'Banque Nord SA',
  siren: '552100554',
  territoriality: 'metropolitanFrance',
  billingAddress: {
    line1: '12 rue de la Boétie',
    line2: null,
    postalCode: '75008',
    city: 'Paris',
    country: 'FR',
  },
});

// Two lines, deliberately chosen so no value collides with another: a whole-day line (80 quarter
// days, i.e. 20 j, at 720,00 €/j) and a fractional-day line (1 quarter day, i.e. 0,25 j, at
// 640,00 €/j). Both `tjmCents` are multiples of 4 (ADR-0002/ADR-0069), as every real `Tjm` is.
const wholeDayLine = regieLine({
  designation: 'Audit DORA — juin 2026',
  missionId: 'f03-mission-1',
  craId: 'f03-cra-1',
  period: '2026-06',
  quarterDays: 80,
  tjmCents: 72_000,
  vat: { kind: 'taxable', basisPoints: 2000 },
});

const fractionalDayLine = regieLine({
  designation: 'Astreinte SOC — juin 2026',
  missionId: 'f03-mission-2',
  craId: 'f03-cra-2',
  period: '2026-06',
  quarterDays: 1,
  tjmCents: 64_000,
  vat: { kind: 'taxable', basisPoints: 2000 },
});

const page = renderToString(
  invoicePage(
    {
      invoice: Invoice.draft({
        id: 'f03-invoice',
        officeId: 'f03-office',
        seller: legalEntity({
          id: 'f03-entity',
          name: 'Sécurité & Conseil',
          legalForm: 'SAS',
          shareCapitalCents: 15_000_000,
          siren: '493296529',
          intraCommunityVatNumber: 'FR23493296529',
          rcsRegistration: 'RCS Paris 493 296 529',
          address: fixtureClient.billingAddress,
          numberPrefix: 'SEC',
        }),
        billedTo: billedParty(fixtureClient),
        supplyPeriod: period(2026, 6),
        lines: [wholeDayLine, fractionalDayLine],
        terms: paymentTerms({ kind: 'net', days: 30 }),
        mentions: legalMentions({
          latePaymentBasisPoints: 3000,
          recoveryIndemnityCents: 4_000,
          earlyPaymentDiscount: { kind: 'none' },
          operationCategory: 'services',
          vatOnDebitsOption: true,
        }),
        validatedBy: ['f03-bruno'],
      }),
      dueDate: null,
      issuanceKey: null,
    },
    undefined,
  ),
);

describe('the printable invoice line table (F03)', () => {
  it('prints the whole-day line as days times its daily rate, reconciling with the amount', () => {
    // quantity: 80 quarter-days = 20 j · daily rate: unitPriceCents (18 000) × 4 = 72 000 = 720 €
    // · 20 j × 720,00 €/j = 14 400,00 €, exactly `amountCents` (80 × 72 000 / 4 = 1 440 000).
    expect(wholeDayLine.amountCents).toBe(1_440_000);
    expect(page).toContain(frenchDays(80)); // "20 j"
    expect(page).toContain(frenchEuros(72_000)); // "720,00 €" — the daily rate, not 180,00 €
    expect(page).toContain(frenchEuros(1_440_000)); // "14 400,00 €"
  });

  it('prints the fractional-day line the same way, still reconciling', () => {
    // quantity: 1 quarter-day = 0,25 j · daily rate: unitPriceCents (16 000) × 4 = 64 000 = 640 €
    // · 0,25 j × 640,00 €/j = 160,00 €, exactly `amountCents` (1 × 64 000 / 4 = 16 000).
    expect(fractionalDayLine.amountCents).toBe(16_000);
    expect(page).toContain(frenchDays(1)); // "0,25 j"
    expect(page).toContain(frenchEuros(64_000)); // "640,00 €" — the daily rate, not 160,00 €
    expect(page).toContain(frenchEuros(16_000)); // "160,00 €"
  });

  it('never prints either line’s obsolete quarter-day price (the mixed-unit bug this protects)', () => {
    // The whole-day line's own quarter-day price (180,00 €) coincides with nothing else on this
    // page — not a daily rate, not an amount — so its presence would mean the regression is back.
    expect(page).not.toContain(frenchEuros(18_000)); // "180,00 €"
  });

  it('labels the column "jour", never "demi-journée" or "quart de journée"', () => {
    expect(page).toContain('Prix unitaire (jour)');
    expect(page).not.toContain('demi-journée');
    expect(page).not.toContain('quart de journée');
  });
});
