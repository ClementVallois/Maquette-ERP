import { InvalidValueError } from '@erp/platform';

import { isValidSiren, type PostalAddress } from './client.ts';

/**
 * The firm issuing the invoice. Its identity is a set of **mandatory mentions** — legal form,
 * share capital, SIREN, RCS registration, intra-EU VAT number, address — carried by the model
 * rather than typed into a template (ADR-0017).
 *
 * It is also half of the numbering series key (ADR-0018): the entity is in the key because a
 * second one added later would otherwise renumber the whole history.
 */
export interface LegalEntity {
  readonly id: string;
  readonly name: string;
  /** SAS, SARL, SA — printed, and part of what identifies the seller on the document. */
  readonly legalForm: string;
  readonly shareCapitalCents: number;
  readonly siren: string;
  readonly intraCommunityVatNumber: string;
  /** The registration as it must be printed: "RCS Paris 552 100 554". */
  readonly rcsRegistration: string;
  readonly address: PostalAddress;
  /** The prefix of every document number of this entity's series. */
  readonly numberPrefix: string;
}

export function legalEntity(input: LegalEntity): LegalEntity {
  if (!isValidSiren(input.siren)) {
    throw new InvalidValueError(
      'seller.siren',
      input.siren,
      'nine digits with a valid check digit',
    );
  }
  if (!Number.isSafeInteger(input.shareCapitalCents) || input.shareCapitalCents <= 0) {
    throw new InvalidValueError(
      'seller.shareCapitalCents',
      input.shareCapitalCents,
      'a whole number of cents above zero',
    );
  }
  if (!/^[A-Z0-9]{2,6}$/.test(input.numberPrefix)) {
    throw new InvalidValueError(
      'seller.numberPrefix',
      input.numberPrefix,
      'two to six capitals or digits',
    );
  }

  return input;
}
