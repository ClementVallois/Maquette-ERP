import { describe, expect, it } from 'vitest';

import { timeline } from './dated.ts';
import { InvalidValueError } from './errors.ts';
import { tjmCentsFromEuros } from './tjm.ts';

describe('a dated reference', () => {
  it('answers what was true on a date', () => {
    const rate = timeline([
      { from: '2026-01-01', to: '2026-05-31', value: tjmCentsFromEuros(650) },
      { from: '2026-06-01', to: null, value: tjmCentsFromEuros(700) },
    ]);

    // The rule this exists for: work done in June bills at June's Tjm, whenever the invoice is
    // drafted. Reading today's rate for a March day is the classic silent overbilling.
    expect(rate.at('2026-03-09')).toBe(65_000);
    expect(rate.at('2026-06-01')).toBe(70_000);
    expect(rate.at('2026-12-31')).toBe(70_000);
  });

  it('includes both bounds', () => {
    const rate = timeline([{ from: '2026-01-01', to: '2026-05-31', value: 1 }]);

    expect(rate.at('2026-01-01')).toBe(1);
    expect(rate.at('2026-05-31')).toBe(1);
    expect(rate.at('2026-06-01')).toBeNull();
    expect(rate.at('2025-12-31')).toBeNull();
  });

  it('says nothing rather than guessing when it holds nothing for a date', () => {
    const gapped = timeline([
      { from: '2026-01-01', to: '2026-01-31', value: 'a' },
      { from: '2026-03-01', to: null, value: 'b' },
    ]);

    expect(gapped.at('2026-02-15')).toBeNull();
  });

  it('reads entries in any order', () => {
    const rate = timeline([
      { from: '2026-06-01', to: null, value: 700 },
      { from: '2026-01-01', to: '2026-05-31', value: 650 },
    ]);

    expect(rate.at('2026-03-09')).toBe(650);
    expect(rate.entries[0]?.value).toBe(650);
  });

  it('refuses two periods that overlap', () => {
    // Two answers for one date is not a timeline; it is a bug that resolves differently
    // depending on iteration order.
    expect(() =>
      timeline([
        { from: '2026-01-01', to: '2026-06-30', value: 650 },
        { from: '2026-06-01', to: null, value: 700 },
      ]),
    ).toThrow(InvalidValueError);
  });

  it('refuses an open period followed by another', () => {
    expect(() =>
      timeline([
        { from: '2026-01-01', to: null, value: 650 },
        { from: '2026-06-01', to: null, value: 700 },
      ]),
    ).toThrow(InvalidValueError);
  });

  it('refuses a period that ends before it starts', () => {
    expect(() => timeline([{ from: '2026-06-01', to: '2026-01-01', value: 650 }])).toThrow(
      InvalidValueError,
    );
  });

  it('holds nothing at all without complaining', () => {
    expect(timeline([]).at('2026-03-09')).toBeNull();
  });
});
