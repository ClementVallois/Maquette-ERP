import { InvalidValueError } from './errors.ts';

/**
 * The daily rate agreed with the client, in **integer cents** (ADR-0002).
 *
 * A Tjm is a whole number of euros, so the cents are always a multiple of 100 — and therefore
 * even. That is not trivia: it is the premise that makes half-day billing exact, because
 * `tjmCents / 2` is the one division this repository allows and it only stays exact while the
 * dividend is even. A Tjm of 150,50 € would break it, which is why the factory refuses one.
 */
export const CENTS_PER_EURO = 100;

export function tjmCentsFromEuros(euros: number): number {
  if (!Number.isInteger(euros)) {
    throw new InvalidValueError('tjm', euros, 'a whole number of euros');
  }
  if (euros <= 0) {
    throw new InvalidValueError('tjm', euros, 'a rate above zero');
  }

  return euros * CENTS_PER_EURO;
}
