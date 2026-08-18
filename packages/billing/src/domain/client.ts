import { InvalidValueError } from '@erp/platform';

import type { ClientId } from './ids.ts';

/**
 * Where a client is established, and the only client attribute the fiscal rules read. The four
 * cases of ADR-0010, and they are four because each carries a different mandatory mention — not
 * because each carries a different number.
 */
export const TERRITORIALITIES = [
  'metropolitanFrance',
  'overseasWithVat',
  'overseasOutsideVatScope',
  'europeanUnion',
] as const;

export type Territoriality = (typeof TERRITORIALITIES)[number];

const FRENCH_TERRITORIALITIES: readonly Territoriality[] = [
  'metropolitanFrance',
  'overseasWithVat',
  'overseasOutsideVatScope',
];

export function isFrench(territoriality: Territoriality): boolean {
  return FRENCH_TERRITORIALITIES.includes(territoriality);
}

export interface PostalAddress {
  readonly line1: string;
  readonly line2: string | null;
  readonly postalCode: string;
  readonly city: string;
  readonly country: string;
}

/**
 * The client, reduced to what issuing an invoice to it requires: who to address, where, its SIREN
 * and its intra-EU VAT number, and where it is established. No contacts, no pipeline, no account
 * manager — an ERP has all of that and none of it decides a rate or a mention.
 */
export interface Client {
  readonly id: ClientId;
  readonly name: string;
  /** Nine digits, Luhn-valid. Required of a French client: the reform makes it a mandatory mention. */
  readonly siren: string | null;
  /** Required of an EU client for the reverse charge to apply — its absence means B2C. */
  readonly intraCommunityVatNumber: string | null;
  readonly territoriality: Territoriality;
  readonly billingAddress: PostalAddress;
  /** A mandatory field of the reform. Equal to the billing address unless it is stated otherwise. */
  readonly deliveryAddress: PostalAddress | null;
}

const SIREN = /^\d{9}$/;
const INTRA_COMMUNITY_VAT = /^[A-Z]{2}[0-9A-Z]{2,13}$/;

export function client(input: {
  id: ClientId;
  name: string;
  siren?: string | null;
  intraCommunityVatNumber?: string | null;
  territoriality: Territoriality;
  billingAddress: PostalAddress;
  deliveryAddress?: PostalAddress | null;
}): Client {
  const siren = input.siren ?? null;
  const vatNumber = input.intraCommunityVatNumber ?? null;

  if (input.name.trim() === '') {
    throw new InvalidValueError('client.name', input.name, 'a name');
  }
  if (siren !== null && !isValidSiren(siren)) {
    throw new InvalidValueError('client.siren', siren, 'nine digits with a valid check digit');
  }
  if (isFrench(input.territoriality) && siren === null) {
    throw new InvalidValueError('client.siren', siren, 'present on a client established in France');
  }
  if (vatNumber !== null && !INTRA_COMMUNITY_VAT.test(vatNumber)) {
    throw new InvalidValueError(
      'client.intraCommunityVatNumber',
      vatNumber,
      'a country code followed by up to thirteen characters',
    );
  }

  return {
    id: input.id,
    name: input.name,
    siren,
    intraCommunityVatNumber: vatNumber,
    territoriality: input.territoriality,
    billingAddress: input.billingAddress,
    deliveryAddress: input.deliveryAddress ?? null,
  };
}

/**
 * The Luhn check the ninth digit of a SIREN carries. Doubling runs from the second digit read
 * right to left, which for a fixed nine-digit string is every even index from the left — writing
 * it the other way round validates a different set of numbers and looks equally plausible.
 */
export function isValidSiren(value: string): boolean {
  if (!SIREN.test(value)) return false;

  const ZERO = 48;
  let sum = 0;
  for (let index = 0; index < value.length; index += 1) {
    // Indexed rather than spread or split: the regex above has already established nine ASCII
    // digits, and both of those iterate code points to solve a problem this string cannot have.
    const digit = value.charCodeAt(index) - ZERO;
    const weighted = index % 2 === 1 ? digit * 2 : digit;
    sum += weighted > 9 ? weighted - 9 : weighted;
  }

  return sum % 10 === 0;
}
