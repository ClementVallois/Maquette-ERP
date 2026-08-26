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

  it('fills both slots with the same value for a full-day line (a full day collapses to two slots)', () => {
    const lines: CraLine[] = [
      { day: '2026-06-01', dayType: 'worked', missionId: 'mission-a', quarterDays: 4 },
    ];

    expect(slotsFor(lines, '2026-06-01')).toStrictEqual([
      { kind: 'mission', missionId: 'mission-a' },
      { kind: 'mission', missionId: 'mission-a' },
    ]);
  });

  it('reads a line worth one slot into the first slot, never the second', () => {
    const lines: CraLine[] = [
      { day: '2026-06-18', dayType: 'absence', missionId: null, quarterDays: 1 },
    ];

    expect(slotsFor(lines, '2026-06-18')).toStrictEqual([{ kind: 'absence' }, { kind: 'empty' }]);
  });

  it('fills slot 0 then slot 1, in the order the lines appear, for two distinct lines on the same day', () => {
    const lines: CraLine[] = [
      { day: '2026-06-11', dayType: 'worked', missionId: 'mission-a', quarterDays: 1 },
      { day: '2026-06-11', dayType: 'worked', missionId: 'mission-b', quarterDays: 1 },
    ];

    expect(slotsFor(lines, '2026-06-11')).toStrictEqual([
      { kind: 'mission', missionId: 'mission-a' },
      { kind: 'mission', missionId: 'mission-b' },
    ]);
  });

  it('ignores lines for other days', () => {
    const lines: CraLine[] = [
      { day: '2026-06-02', dayType: 'worked', missionId: 'mission-a', quarterDays: 4 },
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
      { day: '2026-06-01', dayType: 'worked', missionId: 'mission-a', quarterDays: 2 },
      { day: '2026-06-02', dayType: 'absence', missionId: null, quarterDays: 2 },
      { day: '2026-06-02', dayType: 'absence', missionId: null, quarterDays: 2 },
    ]);
  });

  it('round-trips a full-day line through both directions unchanged', () => {
    const lines: CraLine[] = [
      { day: '2026-06-01', dayType: 'worked', missionId: 'mission-a', quarterDays: 4 },
    ];
    const slots = slotsFor(lines, '2026-06-01');

    expect(entriesFor([{ day: '2026-06-01', slots }])).toStrictEqual([
      { day: '2026-06-01', dayType: 'worked', missionId: 'mission-a', quarterDays: 2 },
      { day: '2026-06-01', dayType: 'worked', missionId: 'mission-a', quarterDays: 2 },
    ]);
  });

  it('exposes the slot indices morning/afternoon name, for callers building the day array', () => {
    expect(MORNING).toBe(0);
    expect(AFTERNOON).toBe(1);
  });
});
