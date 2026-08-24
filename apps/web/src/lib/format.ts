/**
 * French display formats (BUILD-RULES § Working discipline): decimal comma, `JJ/MM/AAAA`,
 * `Europe/Paris`.
 *
 * A **deliberate copy** of `apps/api/src/web/format.ts` (frontend-plan.md Annexe C.8: "labels.ts
 * et format.ts sont des copies … pas d'import cross-app"), not a shared import: `apps/web` may
 * import only `@erp/contracts` (frontend-plan.md §2), and the API's `format.ts` pulls
 * `dayOfWeek`/`MONDAY`/`IsoDate`/`Period` from `@erp/platform`. That package is off limits here
 * even though dependency-cruiser's generic allowlist entry — any app may import any package's
 * public entry point — would let the import through and `pnpm run boundaries` would stay green:
 * discipline, not the tool, is what keeps `@erp/contracts` the only gateway, and importing
 * `@erp/platform` for a date helper would be exactly the drift that discipline exists to catch.
 *
 * Two things below are deliberate rather than incidental, inherited unchanged from the file this
 * mirrors:
 *
 * **No `Intl`.** `Intl.NumberFormat('fr-FR', { style: 'currency' })` takes a number of euros, so
 * reaching it means dividing cents by a hundred — a float on a monetary value, which BUILD-RULES
 * forbids without qualification. The formatting below is string surgery on the integer: no
 * arithmetic on the amount happens at all, so there is nothing for a rounding error to happen to.
 * `Intl.DateTimeFormat` is avoided for a duller reason: its output moves with the ICU version
 * bundled in the browser, and a test that asserts a rendered page would then assert the runtime.
 *
 * **No timezone conversion.** A worked day arrives as `YYYY-MM-DD` (ADR-0011). Parsing it into a
 * `Date` to reformat it is how a day moves to the one before it; the string is split instead.
 * `frenchWeekday` below computes its weekday from the digits with the same integer arithmetic
 * `@erp/platform`'s `dayOfWeek` uses (Sakamoto's algorithm, `packages/platform/src/iso-date.ts`),
 * ported here rather than imported for the reason above. It cannot shift a day: no `Date`, no
 * timezone and no instant is ever constructed, only arithmetic on the three numbers already in
 * the string.
 */

const NARROW_NO_BREAK_SPACE = '\u202f'; // narrow no-break space, between digit groups and before "%"
const NO_BREAK_SPACE = '\u00a0'; // no-break space, before "€" and before "j"

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

/**
 * `2026-06` → `juin 2026`. Narrowed to `string` only: the API's overload also accepted a `Period`
 * object from `@erp/platform`, which `apps/web` does not import (see the file header). Every
 * caller in this SPA already has the period as the `YYYY-MM` string the API sends on the wire.
 */
export function frenchMonth(period: string): string {
  const year = period.slice(0, 4);
  const month = Number.parseInt(period.slice(5, 7), 10);

  return `${MONTHS[month - 1] ?? ''} ${year}`;
}

// Sakamoto's algorithm, ported from `packages/platform/src/iso-date.ts` `dayOfWeek` — see the file
// header for why it is ported rather than imported. `MONTH_OFFSET` holds the offset of each month
// inside the year; January and February are treated as months of the previous year (the leap-day
// correction), which is why `year` is decremented for them below.
const MONTH_OFFSET = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
const SUNDAY_FIRST_SUNDAY = 0;
const ISO_SUNDAY = 7;

/** ISO-8601 numbering of the return value: 1 is Monday, 7 is Sunday — never constructed via `Date`. */
function isoWeekday(date: string): number {
  const year = Number.parseInt(date.slice(0, 4), 10);
  const month = Number.parseInt(date.slice(5, 7), 10);
  const day = Number.parseInt(date.slice(8, 10), 10);
  // A month outside 1-12 falls back to 0 rather than throwing: this module's contract, like the
  // rest of it, is pure display on a string already validated by the API's zod boundary — it has
  // no domain rule of its own to enforce a second time.
  const offset = MONTH_OFFSET[month - 1] ?? 0;
  const y = month < 3 ? year - 1 : year;
  const sundayFirst =
    (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + offset + day) % 7;

  return sundayFirst === SUNDAY_FIRST_SUNDAY ? ISO_SUNDAY : sundayFirst;
}

const MONDAY = 1;

/** `2026-06-15` → `lundi`. ISO weeks start on Monday (BUILD-RULES). */
export function frenchWeekday(date: string): string {
  return WEEKDAYS[isoWeekday(date) - MONDAY] ?? '';
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
