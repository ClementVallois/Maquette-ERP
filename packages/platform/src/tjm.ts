import { InvalidValueError } from './errors.ts';

/**
 * The daily rate agreed with the client, in **integer cents** (ADR-0002).
 *
 * A Tjm is a whole number of euros, so the cents are always a multiple of 100 — and therefore
 * divisible by four. That is not trivia: it is the premise that makes quarter-day billing exact
 * (ADR-0069), because `tjmCents / 4` is the one division this repository allows and it only
 * stays exact while the dividend is a multiple of 4. A Tjm of 150,50 € would break it, which is
 * why the factory refuses one.
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
