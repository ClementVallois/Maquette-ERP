import { dayOfWeek, type IsoDate, MONDAY, type Period } from '@erp/platform';

/**
 * French display formats (BUILD-RULES § Working discipline): decimal comma, `JJ/MM/AAAA`,
 * `Europe/Paris`.
 *
 * Two things here are deliberate rather than incidental.
 *
 * **No `Intl`.** `Intl.NumberFormat('fr-FR', { style: 'currency' })` takes a number of euros, so
 * reaching it means dividing cents by a hundred — a float on a monetary value, which BUILD-RULES
 * forbids without qualification. The formatting below is string surgery on the integer: no
 * arithmetic on the amount happens at all, so there is nothing for a rounding error to happen to.
 * `Intl.DateTimeFormat` is avoided for a duller reason: its output moves with the ICU version
 * bundled in Node, and a test that asserts a rendered page would then assert the runtime.
 *
 * **No timezone conversion.** A worked day is a `date` and arrives as `YYYY-MM-DD` (ADR-0011 and
 * the `pg` type parser in `composition.ts`). Parsing it into a `Date` to reformat it is how a day
 * moves to the one before it; the string is split instead.
 */

const NARROW_NO_BREAK_SPACE = ' ';
const NO_BREAK_SPACE = ' ';

const MONTHS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const;

const WEEKDAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;

/** `2026-06-15` → `15/06/2026`. */
export function frenchDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');

  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/** `2026-06` or a `Period` → `juin 2026`. */
export function frenchMonth(period: Period | string): string {
  const [year, month] =
    typeof period === 'string'
      ? [period.slice(0, 4), Number.parseInt(period.slice(5, 7), 10)]
      : [String(period.year), period.month];

  return `${MONTHS[month - 1] ?? ''} ${year}`;
}

/**
 * `2026-06-15` → `lundi`. ISO weeks start on Monday (BUILD-RULES), and the kernel's `dayOfWeek`
 * already numbers them that way (`MONDAY = 1`) with no `Date` involved — which is why this reaches
 * for it rather than for `Date.prototype.getDay`, whose week starts on Sunday and whose result
 * moves with the machine's timezone.
 */
export function frenchWeekday(date: IsoDate): string {
  return WEEKDAYS[dayOfWeek(date) - MONDAY] ?? '';
}

const GROUP = 3;
const CENTIMES = 2;

/** Groups a run of digits in threes from the right: `1234567` → `1 234 567`. */
function grouped(digits: string): string {
  let out = '';

  for (let index = digits.length; index > 0; index -= GROUP) {
    const start = Math.max(0, index - GROUP);
    out = digits.slice(start, index) + (out === '' ? '' : NARROW_NO_BREAK_SPACE + out);
  }

  return out;
}

/**
 * `123456` → `1 234,56 €`. The integer is never divided: it is padded to at least three digits so
 * that the last two are always the centimes, and then cut.
 */
export function frenchEuros(cents: number): string {
  const negative = cents < 0;
  const digits = String(Math.abs(cents)).padStart(CENTIMES + 1, '0');
  const euros = grouped(digits.slice(0, -CENTIMES));
  const centimes = digits.slice(-CENTIMES);

  return `${negative ? '−' : ''}${euros},${centimes}${NO_BREAK_SPACE}€`;
}

/** `3` → `1,5 j`. Half-days are integers (ADR-0012) and stay integers here too. */
export function frenchDays(halfDays: number): string {
  const negative = halfDays < 0;
  const absolute = Math.abs(halfDays);
  const whole = (absolute - (absolute % 2)) / 2;
  const half = absolute % 2 === 1 ? ',5' : '';

  return `${negative ? '−' : ''}${String(whole)}${half}${NO_BREAK_SPACE}j`;
}

/** A rate in basis points (ADR-0035) → `20 %`. Same string surgery, same reason. */
export function frenchPercent(basisPoints: number): string {
  const digits = String(Math.abs(basisPoints)).padStart(CENTIMES + 1, '0');
  const whole = digits.slice(0, -CENTIMES);
  const fraction = digits.slice(-CENTIMES).replace(/0+$/u, '');

  return `${basisPoints < 0 ? '−' : ''}${grouped(whole)}${fraction === '' ? '' : `,${fraction}`}${NARROW_NO_BREAK_SPACE}%`;
}
