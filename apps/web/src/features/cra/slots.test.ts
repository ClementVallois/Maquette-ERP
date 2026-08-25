import { describe, expect, it } from 'vitest';

import { AFTERNOON, entriesFor, MORNING, slotsFor } from './slots';
import type { CraLine } from './types';

/**
 * The two behaviours ADR-0066 names as load-bearing, asserted by name rather than left to be
 * discovered against a real seed during Playwright's J1.
 */
describe('slotsFor', () => {
  it('reads a day with no lines as two empty slots', () => {
    expect(slotsFor([], '2026-06-05')).toStrictEqual([{ kind: 'empty' }, { kind: 'empty' }]);
  });

  it('fills both slots with the same value for a two-half-day line (identical halves collapse)', () => {
    const lines: CraLine[] = [
      { day: '2026-06-01', dayType: 'worked', missionId: 'mission-a', halfDays: 2 },
    ];

    expect(slotsFor(lines, '2026-06-01')).toStrictEqual([
      { kind: 'mission', missionId: 'mission-a' },
      { kind: 'mission', missionId: 'mission-a' },
    ]);
  });

  it('reads a lone half-day line into the first slot, never the second', () => {
    const lines: CraLine[] = [
      { day: '2026-06-18', dayType: 'absence', missionId: null, halfDays: 1 },
    ];

    expect(slotsFor(lines, '2026-06-18')).toStrictEqual([{ kind: 'absence' }, { kind: 'empty' }]);
  });

  it('fills slot 0 then slot 1, in the order the lines appear, for two distinct half-days on the same day', () => {
    const lines: CraLine[] = [
      { day: '2026-06-11', dayType: 'worked', missionId: 'mission-a', halfDays: 1 },
      { day: '2026-06-11', dayType: 'worked', missionId: 'mission-b', halfDays: 1 },
    ];

    expect(slotsFor(lines, '2026-06-11')).toStrictEqual([
      { kind: 'mission', missionId: 'mission-a' },
      { kind: 'mission', missionId: 'mission-b' },
    ]);
  });

  it('ignores lines for other days', () => {
    const lines: CraLine[] = [
      { day: '2026-06-02', dayType: 'worked', missionId: 'mission-a', halfDays: 2 },
    ];

    expect(slotsFor(lines, '2026-06-01')).toStrictEqual([{ kind: 'empty' }, { kind: 'empty' }]);
  });
});

describe('entriesFor', () => {
  it('emits nothing for an all-empty month', () => {
    expect(
      entriesFor([{ day: '2026-06-01', slots: [{ kind: 'empty' }, { kind: 'empty' }] }]),
    ).toStrictEqual([]);
  });

  it('emits one entry per filled slot, worked and absence alike', () => {
    const days = [
      {
        day: '2026-06-01',
        slots: [{ kind: 'mission', missionId: 'mission-a' }, { kind: 'empty' }] as const,
      },
      { day: '2026-06-02', slots: [{ kind: 'absence' }, { kind: 'absence' }] as const },
    ];

    expect(entriesFor(days)).toStrictEqual([
      { day: '2026-06-01', dayType: 'worked', missionId: 'mission-a' },
      { day: '2026-06-02', dayType: 'absence', missionId: null },
      { day: '2026-06-02', dayType: 'absence', missionId: null },
    ]);
  });

  it('round-trips a two-half-day line through both directions unchanged', () => {
    const lines: CraLine[] = [
      { day: '2026-06-01', dayType: 'worked', missionId: 'mission-a', halfDays: 2 },
    ];
    const slots = slotsFor(lines, '2026-06-01');

    expect(entriesFor([{ day: '2026-06-01', slots }])).toStrictEqual([
      { day: '2026-06-01', dayType: 'worked', missionId: 'mission-a' },
      { day: '2026-06-01', dayType: 'worked', missionId: 'mission-a' },
    ]);
  });

  it('exposes the slot indices morning/afternoon name, for callers building the day array', () => {
    expect(MORNING).toBe(0);
    expect(AFTERNOON).toBe(1);
  });
});
