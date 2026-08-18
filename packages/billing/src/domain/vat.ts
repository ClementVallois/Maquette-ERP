import { type IsoDate, type Timeline, timeline } from '@erp/platform';

import type { Client, Territoriality } from './client.ts';
import { NoVatRateError } from './errors.ts';
import { wholePercent } from './money.ts';

/**
 * VAT resolution: the rate is **resolved** from the operation, never entered, and then frozen onto
 * the line that carries it (ADR-0010). Nothing downstream reads this file again — an issued
 * invoice does not change when a rate does.
 */

/**
 * What is being sold. One value today, and it is a parameter rather than an assumption because
 * the rate genuinely depends on it: a training course, a resold licence and a work on a building
 * resolve differently from an audit day. Collapsing it would make the rate look like a property
 * of the client, which is the failure ADR-0010 exists to prevent.
 */
export const SERVICE_NATURES = ['consultingService'] as const;

export type ServiceNature = (typeof SERVICE_NATURES)[number];

export const NOT_CHARGED_REASONS = ['territoryOutsideVatScope', 'reverseChargeEuB2b'] as const;

export type NotChargedReason = (typeof NOT_CHARGED_REASONS)[number];

/**
 * How VAT applies to one line. "Not charged" is a **different shape** from a rate of zero, not a
 * different number (ADR-0010): the two print different mandatory mentions and are declared
 * differently, and a `basisPoints: 0` would make them indistinguishable at the first `sum`.
 */
export type VatTreatment =
  | { readonly kind: 'taxable'; readonly basisPoints: number }
  | { readonly kind: 'notCharged'; readonly reason: NotChargedReason };

/**
 * The mention the invoice is legally required to print, per reason. French because it is printed
 * text on a French fiscal document, not an identifier — the code around it stays English.
 */
export const NOT_CHARGED_MENTIONS: Readonly<Record<NotChargedReason, string>> = {
  territoryOutsideVatScope:
    'TVA non applicable — opération hors du champ d’application de la TVA (art. 294-1 du CGI)',
  reverseChargeEuB2b: 'Autoliquidation — TVA due par le preneur (art. 283-2 du CGI)',
};

// 8,5 % — the standard rate of Guadeloupe, Martinique and La Réunion. Written in basis points for
// the reason ADR-0035 gives: this is the rate a decimal fraction gets wrong.
const OVERSEAS_STANDARD_BASIS_POINTS = 850;

/**
 * A **dated** reference, not a constant. A rate change does not rewrite past invoices, and the
 * only way to guarantee that is for the rate to be a function of a date from the start — a
 * constant promoted to a table later is a migration over every issued document.
 */
const STANDARD_RATE: Readonly<Record<Territoriality, Timeline<number>>> = {
  metropolitanFrance: timeline([{ from: '2014-01-01', to: null, value: wholePercent(20) }]),
  overseasWithVat: timeline([
    { from: '2014-01-01', to: null, value: OVERSEAS_STANDARD_BASIS_POINTS },
  ]),
  // Outside the scope of the tax: no rate, at any date. Present as an entry so that the record is
  // "there is deliberately none" rather than a missing key.
  overseasOutsideVatScope: timeline([]),
  europeanUnion: timeline([{ from: '2014-01-01', to: null, value: wholePercent(20) }]),
};

/**
 * The four inputs of ADR-0010: the nature of the service, the place of taxation, the status of the
 * customer, and the date of the chargeable event.
 *
 * The customer's status is read from its intra-EU VAT number: the reverse charge applies to a
 * taxable customer in another member state, and a client of the same country with no number is a
 * consumer, for whom the place of supply is France and French VAT applies.
 */
export function resolveVat(input: {
  serviceNature: ServiceNature;
  client: Client;
  on: IsoDate;
}): VatTreatment {
  const { territoriality } = input.client;

  if (territoriality === 'overseasOutsideVatScope') {
    return { kind: 'notCharged', reason: 'territoryOutsideVatScope' };
  }
  if (territoriality === 'europeanUnion' && input.client.intraCommunityVatNumber !== null) {
    return { kind: 'notCharged', reason: 'reverseChargeEuB2b' };
  }

  const basisPoints = STANDARD_RATE[territoriality].at(input.on);
  if (basisPoints === null) {
    throw new NoVatRateError(territoriality, input.on);
  }

  return { kind: 'taxable', basisPoints };
}

/**
 * The key lines are grouped by for the recapitulative the invoice must print. Two lines share a
 * group when they share a rate, or when they share a reason for carrying none — which is why this
 * is a key and not a number.
 */
export function vatGroupKey(treatment: VatTreatment): string {
  return treatment.kind === 'taxable'
    ? `taxable:${String(treatment.basisPoints)}`
    : `notCharged:${treatment.reason}`;
}
