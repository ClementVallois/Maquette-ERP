import { describe, expect, it } from 'vitest';

import {
  frenchDate,
  frenchDays,
  frenchEuros,
  frenchMonth,
  frenchMonthName,
  frenchPercent,
  frenchWeekday,
} from './format.ts';

/**
 * Ported from `apps/api/src/web/format.test.ts`, every case included (frontend-plan.md task 3.4:
 * "mêmes entrées, mêmes sorties"). Two adjustments, both from the same source of truth as
 * `format.ts` itself:
 *
 * - `frenchMonth(period(2026, 1))` becomes `frenchMonth('2026-01')` — the API test exercised both
 *   overloads of a function this file narrows to `string` only (see `format.ts`'s header).
 * - `frenchWeekday(isoDate('2026-06-01'))` becomes `frenchWeekday('2026-06-01')` — the branded
 *   `IsoDate` from `@erp/platform` is a plain `string` on this side of the HTTP boundary.
 *
 * The separators are not ASCII spaces and the tests say which ones they are: a narrow no-break
 * space between digit groups and before `%`, a no-break space before `€`. Asserting against a
 * literal `' '` would pass on a plain space and produce `1 234,56\n€` at a line break.
 */
const NARROW = '\u202f';
const NBSP = '\u00a0';

describe('frenchEuros', () => {
  it('writes cents as euros with a decimal comma', () => {
    expect(frenchEuros(123_456)).toBe(`1${NARROW}234,56${NBSP}€`);
  });

  it('keeps both centime digits, including the ones a float would drop', () => {
    expect(frenchEuros(100)).toBe(`1,00${NBSP}€`);
    expect(frenchEuros(105)).toBe(`1,05${NBSP}€`);
    expect(frenchEuros(150)).toBe(`1,50${NBSP}€`);
  });

  it('renders an amount smaller than one euro', () => {
    expect(frenchEuros(7)).toBe(`0,07${NBSP}€`);
    expect(frenchEuros(0)).toBe(`0,00${NBSP}€`);
  });

  it('groups large amounts in threes', () => {
    expect(frenchEuros(1_234_567_89)).toBe(`1${NARROW}234${NARROW}567,89${NBSP}€`);
  });

  it('uses a real minus sign, not a hyphen', () => {
    expect(frenchEuros(-4200)).toBe(`−42,00${NBSP}€`);
  });

  it('never loses a centime, at any magnitude a consulting firm invoices', () => {
    // The property that matters: the digits that come out are the digits that went in. A
    // formatter that divides by 100 fails this somewhere above 2^53 cents; one that does string
    // surgery cannot fail it at all, and this is the test that says which one is in the file.
    for (const cents of [1, 99, 100, 101, 999_99, 1_000_00, 9_007_199_254_740_99]) {
      const digits = frenchEuros(cents).replace(/[^0-9]/gu, '');

      expect(digits).toBe(String(cents).padStart(3, '0'));
    }
  });
});

describe('frenchDays', () => {
  it('writes a whole number of days when the quarter-days divide evenly', () => {
    expect(frenchDays(0)).toBe(`0${NBSP}j`);
    expect(frenchDays(4)).toBe(`1${NBSP}j`);
    expect(frenchDays(80)).toBe(`20${NBSP}j`);
  });

  it('writes a quarter, a half and three quarters with a decimal comma', () => {
    expect(frenchDays(1)).toBe(`0,25${NBSP}j`);
    expect(frenchDays(2)).toBe(`0,5${NBSP}j`);
    expect(frenchDays(3)).toBe(`0,75${NBSP}j`);
  });

  it('carries the fraction past a whole day', () => {
    expect(frenchDays(5)).toBe(`1,25${NBSP}j`);
    expect(frenchDays(6)).toBe(`1,5${NBSP}j`);
    expect(frenchDays(7)).toBe(`1,75${NBSP}j`);
    expect(frenchDays(81)).toBe(`20,25${NBSP}j`);
  });

  it('carries the sign onto a negative count', () => {
    expect(frenchDays(-1)).toBe(`−0,25${NBSP}j`);
  });
});

describe('frenchDate and frenchMonth', () => {
  it('writes a date JJ/MM/AAAA', () => {
    expect(frenchDate('2026-06-15')).toBe('15/06/2026');
  });

  it('keeps the leading zeros a French reader expects', () => {
    expect(frenchDate('2026-01-02')).toBe('02/01/2026');
  });

  it('does not shift the day, whatever the machine timezone is', () => {
    // `new Date('2026-01-01')` is UTC midnight, which is 31/12/2025 anywhere west of Greenwich.
    // The string is split rather than parsed, so there is no instant to be in the wrong zone.
    expect(frenchDate('2026-01-01')).toBe('01/01/2026');
    expect(frenchDate('2026-12-31')).toBe('31/12/2026');
  });

  it('names the month, from the YYYY-MM string the API sends', () => {
    expect(frenchMonth('2026-06')).toBe('juin 2026');
    expect(frenchMonth('2026-01')).toBe('janvier 2026');
    expect(frenchMonth('2026-12')).toBe('décembre 2026');
  });
});

describe('frenchMonthName', () => {
  it('names a calendar month on its own, no year attached', () => {
    expect(frenchMonthName(1)).toBe('janvier');
    expect(frenchMonthName(6)).toBe('juin');
    expect(frenchMonthName(12)).toBe('décembre');
  });
});

describe('frenchWeekday', () => {
  it('starts the week on Monday', () => {
    // 2026-06-01 is a Monday; the following Saturday and Sunday are what the Cra grid flags.
    expect(frenchWeekday('2026-06-01')).toBe('lundi');
    expect(frenchWeekday('2026-06-06')).toBe('samedi');
    expect(frenchWeekday('2026-06-07')).toBe('dimanche');
  });
});

describe('frenchPercent', () => {
  it('writes a whole VAT rate without a decimal part', () => {
    expect(frenchPercent(2000)).toBe(`20${NARROW}%`);
    expect(frenchPercent(0)).toBe(`0${NARROW}%`);
  });

  it('writes the DOM rate, which is not whole', () => {
    expect(frenchPercent(850)).toBe(`8,5${NARROW}%`);
  });
});
