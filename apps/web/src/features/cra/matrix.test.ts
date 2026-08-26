import { describe, expect, it } from 'vitest';

import {
  ABSENCE_ROW_KEY,
  addRow,
  clearRow,
  dayTotal,
  entriesFromMatrix,
  fillEmptyWorkdays,
  initMatrix,
  isDayOverbooked,
  isRowEmpty,
  removeRow,
  rowTotal,
  valueAt,
  withValue,
} from './matrix';
import type { CraGridResponse } from './types';

const MISSION_A = 'mission-a';
const MISSION_B = 'mission-b';

function gridResponse(overrides: Partial<CraGridResponse> = {}): CraGridResponse {
  return {
    period: '2026-08',
    craId: null,
    status: null,
    days: [
      { date: '2026-08-03', nonWorkable: null },
      { date: '2026-08-04', nonWorkable: null },
    ],
    missions: [
      {
        missionId: MISSION_A,
        name: 'Audit DORA',
        clientName: 'Banque',
        assignableDays: ['2026-08-03', '2026-08-04'],
      },
      {
        missionId: MISSION_B,
        name: 'SOC Run',
        clientName: 'Banque',
        assignableDays: ['2026-08-03', '2026-08-04'],
      },
    ],
    lines: [],
    flags: [],
    refusal: null,
    editable: true,
    validatedBy: null,
    ...overrides,
  };
}

describe('initMatrix', () => {
  it('puts one row per mission that carries a recorded quarter, plus Absence always last', () => {
    const matrix = initMatrix(
      gridResponse({
        lines: [
          { day: '2026-08-03', dayType: 'worked', missionId: MISSION_A, quarterDays: 2 },
          { day: '2026-08-03', dayType: 'worked', missionId: MISSION_B, quarterDays: 2 },
        ],
      }),
    );

    expect(matrix.rowOrder).toStrictEqual([MISSION_A, MISSION_B, ABSENCE_ROW_KEY]);
    expect(valueAt(matrix, MISSION_A, '2026-08-03')).toBe(2);
    expect(valueAt(matrix, MISSION_B, '2026-08-03')).toBe(2);
  });

  it('shows Absence even when nothing is recorded on it, and no mission row when nothing is recorded', () => {
    const matrix = initMatrix(gridResponse());

    expect(matrix.rowOrder).toStrictEqual([ABSENCE_ROW_KEY]);
  });

  it('does not drop a line whose mission the grid no longer offers', () => {
    const matrix = initMatrix(
      gridResponse({
        missions: [],
        lines: [
          { day: '2026-08-03', dayType: 'worked', missionId: 'mission-gone', quarterDays: 4 },
        ],
      }),
    );

    expect(matrix.rowOrder).toStrictEqual(['mission-gone', ABSENCE_ROW_KEY]);
  });
});

describe('withValue / dayTotal', () => {
  it('a cell set to 0 is removed, not stored as a zero entry', () => {
    let matrix = initMatrix(gridResponse());
    matrix = withValue(matrix, MISSION_A, '2026-08-03', 3);
    expect(dayTotal(matrix, '2026-08-03')).toBe(3);

    matrix = withValue(matrix, MISSION_A, '2026-08-03', 0);
    expect(dayTotal(matrix, '2026-08-03')).toBe(0);
    expect(entriesFromMatrix(matrix)).toStrictEqual([]);
  });

  it('sums every visible row for a day, not only one mission', () => {
    let matrix = addRow(initMatrix(gridResponse()), MISSION_A);
    matrix = addRow(matrix, MISSION_B);
    matrix = withValue(matrix, MISSION_A, '2026-08-03', 2);
    matrix = withValue(matrix, MISSION_B, '2026-08-03', 2);

    expect(dayTotal(matrix, '2026-08-03')).toBe(4);
  });
});

describe('isDayOverbooked', () => {
  it('is false at exactly one full day and below', () => {
    let matrix = addRow(initMatrix(gridResponse()), MISSION_A);
    matrix = withValue(matrix, MISSION_A, '2026-08-03', 4);

    expect(isDayOverbooked(matrix, '2026-08-03')).toBe(false);
  });

  it('is true past one full day, summed across every row on that day', () => {
    let matrix = addRow(initMatrix(gridResponse()), MISSION_A);
    matrix = addRow(matrix, MISSION_B);
    matrix = withValue(matrix, MISSION_A, '2026-08-03', 4);
    matrix = withValue(matrix, MISSION_B, '2026-08-03', 1);

    expect(isDayOverbooked(matrix, '2026-08-03')).toBe(true);
  });

  it('is false on a day with nothing recorded', () => {
    const matrix = initMatrix(gridResponse());

    expect(isDayOverbooked(matrix, '2026-08-03')).toBe(false);
  });
});

describe('addRow / removeRow / clearRow / isRowEmpty', () => {
  it('addRow inserts before Absence and is a no-op if already visible', () => {
    let matrix = initMatrix(gridResponse());
    matrix = addRow(matrix, MISSION_A);
    expect(matrix.rowOrder).toStrictEqual([MISSION_A, ABSENCE_ROW_KEY]);

    matrix = addRow(matrix, MISSION_A);
    expect(matrix.rowOrder).toStrictEqual([MISSION_A, ABSENCE_ROW_KEY]);
  });

  it('clearRow empties the cells and keeps the row; removeRow drops the row and its cells', () => {
    let matrix = addRow(initMatrix(gridResponse()), MISSION_A);
    matrix = withValue(matrix, MISSION_A, '2026-08-03', 4);
    expect(isRowEmpty(matrix, MISSION_A, ['2026-08-03', '2026-08-04'])).toBe(false);

    matrix = clearRow(matrix, MISSION_A);
    expect(matrix.rowOrder).toContain(MISSION_A);
    expect(isRowEmpty(matrix, MISSION_A, ['2026-08-03', '2026-08-04'])).toBe(true);

    matrix = withValue(matrix, MISSION_A, '2026-08-03', 1);
    matrix = removeRow(matrix, MISSION_A);
    expect(matrix.rowOrder).not.toContain(MISSION_A);
    expect(dayTotal(matrix, '2026-08-03')).toBe(0);
  });
});

describe('fillEmptyWorkdays', () => {
  it('fills every day this row is assignable on and whose day total is nil, never touching a day already carrying anything', () => {
    let matrix = addRow(initMatrix(gridResponse()), MISSION_A);
    matrix = withValue(matrix, MISSION_A, '2026-08-03', 1);

    matrix = fillEmptyWorkdays(
      matrix,
      MISSION_A,
      ['2026-08-03', '2026-08-04'],
      new Set(['2026-08-03', '2026-08-04']),
    );

    expect(valueAt(matrix, MISSION_A, '2026-08-03')).toBe(1); // untouched, already carried something
    expect(valueAt(matrix, MISSION_A, '2026-08-04')).toBe(4); // filled
  });

  it('never fills a day this row is not assignable on', () => {
    let matrix = addRow(initMatrix(gridResponse()), MISSION_A);
    matrix = fillEmptyWorkdays(
      matrix,
      MISSION_A,
      ['2026-08-03', '2026-08-04'],
      new Set(['2026-08-03']),
    );

    expect(valueAt(matrix, MISSION_A, '2026-08-03')).toBe(4);
    expect(valueAt(matrix, MISSION_A, '2026-08-04')).toBe(0);
  });

  it('never overbooks a day another row already recorded something on', () => {
    let matrix = addRow(initMatrix(gridResponse()), MISSION_A);
    matrix = addRow(matrix, MISSION_B);
    matrix = withValue(matrix, MISSION_B, '2026-08-03', 2);

    matrix = fillEmptyWorkdays(matrix, MISSION_A, ['2026-08-03'], new Set(['2026-08-03']));

    expect(valueAt(matrix, MISSION_A, '2026-08-03')).toBe(0);
    expect(dayTotal(matrix, '2026-08-03')).toBe(2);
  });
});

describe('rowTotal / entriesFromMatrix', () => {
  it('rowTotal sums only the given days, on one row', () => {
    let matrix = addRow(initMatrix(gridResponse()), MISSION_A);
    matrix = withValue(matrix, MISSION_A, '2026-08-03', 2);
    matrix = withValue(matrix, MISSION_A, '2026-08-04', 3);

    expect(rowTotal(matrix, MISSION_A, ['2026-08-03', '2026-08-04'])).toBe(5);
  });

  it('produces one entry per non-empty cell, worked rows carrying missionId and Absence carrying null', () => {
    let matrix = addRow(initMatrix(gridResponse()), MISSION_A);
    matrix = withValue(matrix, MISSION_A, '2026-08-03', 2);
    matrix = withValue(matrix, ABSENCE_ROW_KEY, '2026-08-04', 4);

    expect(entriesFromMatrix(matrix)).toStrictEqual(
      expect.arrayContaining([
        { day: '2026-08-03', dayType: 'worked', missionId: MISSION_A, quarterDays: 2 },
        { day: '2026-08-04', dayType: 'absence', missionId: null, quarterDays: 4 },
      ]),
    );
  });
});
