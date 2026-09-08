import { describe, expect, it } from 'vitest';

import { createDraftState, reduceDraft } from './draft-state';
import { addRow, initMatrix, valueAt } from './matrix';
import type { CraGridResponse } from './types';

function gridResponse(overrides: Partial<CraGridResponse> = {}): CraGridResponse {
  return {
    period: '2026-08',
    craId: null,
    status: null,
    days: [{ date: '2026-08-03', nonWorkable: null }],
    missions: [
      {
        missionId: 'mission-a',
        name: 'Audit DORA',
        clientName: 'Banque',
        assignableDays: ['2026-08-03'],
      },
    ],
    lines: [],
    flags: [],
    refusal: null,
    editable: true,
    validatedBy: null,
    timeline: [],
    ...overrides,
  };
}

describe('CRA draft reducer', () => {
  it('applies edits through one state transition and marks the draft dirty', () => {
    const initial = createDraftState(addRow(initMatrix(gridResponse()), 'mission-a'));
    const changed = reduceDraft(initial, {
      kind: 'setCell',
      rowKey: 'mission-a',
      day: '2026-08-03',
      value: 4,
    });

    expect(valueAt(changed.matrix, 'mission-a', '2026-08-03')).toBe(4);
    expect(changed.dirty).toBe(true);
  });

  it('undoes the last row action and clears that one-level history', () => {
    const initial = createDraftState(addRow(initMatrix(gridResponse()), 'mission-a'));
    const filled = reduceDraft(initial, {
      kind: 'fillRow',
      rowKey: 'mission-a',
      workableDays: ['2026-08-03'],
      assignableDays: new Set(['2026-08-03']),
      action: 'Fill',
      detail: 'Mission A',
    });
    const undone = reduceDraft(filled, { kind: 'undo' });

    expect(valueAt(filled.matrix, 'mission-a', '2026-08-03')).toBe(4);
    expect(undone.matrix).toStrictEqual(initial.matrix);
    expect(undone.undo).toBeNull();
    expect(undone.dirty).toBe(true);
  });

  it('clears a row without removing it and restores its cells through undo', () => {
    const initialMatrix = addRow(initMatrix(gridResponse()), 'mission-a');
    const edited = reduceDraft(createDraftState(initialMatrix), {
      kind: 'setCell',
      rowKey: 'mission-a',
      day: '2026-08-03',
      value: 3,
    });
    const cleared = reduceDraft(edited, {
      kind: 'clearRow',
      rowKey: 'mission-a',
      action: 'Clear',
      detail: 'Mission A',
    });

    expect(cleared.matrix.rowOrder).toContain('mission-a');
    expect(valueAt(cleared.matrix, 'mission-a', '2026-08-03')).toBe(0);
    expect(cleared.undo).toStrictEqual({
      matrix: edited.matrix,
      action: 'Clear',
      detail: 'Mission A',
    });
    expect(reduceDraft(cleared, { kind: 'undo' }).matrix).toStrictEqual(edited.matrix);
  });

  it('adds and removes activity rows through the draft state', () => {
    const initial = createDraftState(initMatrix(gridResponse()));
    const added = reduceDraft(initial, { kind: 'addRow', rowKey: 'mission-a' });
    const edited = reduceDraft(added, {
      kind: 'setCell',
      rowKey: 'mission-a',
      day: '2026-08-03',
      value: 2,
    });
    const removed = reduceDraft(edited, { kind: 'removeRow', rowKey: 'mission-a' });

    expect(added.matrix.rowOrder).toStrictEqual(['mission-a', 'absence']);
    expect(removed.matrix.rowOrder).toStrictEqual(['absence']);
    expect(valueAt(removed.matrix, 'mission-a', '2026-08-03')).toBe(0);
    expect(removed.dirty).toBe(true);
  });

  it('replaces the matrix with one undoable desktop or mobile bulk edit', () => {
    const initial = createDraftState(initMatrix(gridResponse()));
    const replacement = addRow(initial.matrix, 'mission-a');
    const changed = reduceDraft(initial, {
      kind: 'replaceWithUndo',
      matrix: replacement,
      action: 'Fill week',
      detail: 'Week 32',
    });

    expect(changed).toStrictEqual({
      matrix: replacement,
      dirty: true,
      undo: {
        matrix: initial.matrix,
        action: 'Fill week',
        detail: 'Week 32',
      },
    });
  });

  it('marks an acknowledged save clean without discarding its matrix or undo history', () => {
    const initial = createDraftState(addRow(initMatrix(gridResponse()), 'mission-a'));
    const changed = reduceDraft(initial, {
      kind: 'clearRow',
      rowKey: 'mission-a',
      action: 'Clear',
      detail: null,
    });
    const saved = reduceDraft(changed, { kind: 'markSaved' });

    expect(saved.matrix).toBe(changed.matrix);
    expect(saved.undo).toBe(changed.undo);
    expect(saved.dirty).toBe(false);
  });

  it('adopts server data as a clean draft with no stale undo action', () => {
    const initial = createDraftState(initMatrix(gridResponse()));
    const changed = reduceDraft(initial, {
      kind: 'setCell',
      rowKey: 'absence',
      day: '2026-08-03',
      value: 4,
    });
    const replacement = initMatrix(gridResponse({ status: 'submitted', editable: false }));

    expect(reduceDraft(changed, { kind: 'replace', matrix: replacement })).toStrictEqual({
      matrix: replacement,
      dirty: false,
      undo: null,
    });
  });
});
