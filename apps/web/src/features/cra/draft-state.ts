import {
  addRow,
  clearRow,
  fillEmptyWorkdays,
  removeRow,
  withValue,
  type MatrixState,
} from './matrix';
import type { CellQuantity } from './matrix';

export interface UndoState {
  readonly matrix: MatrixState;
  readonly action: string;
  readonly detail: string | null;
}

export interface CraDraftState {
  readonly matrix: MatrixState;
  readonly dirty: boolean;
  readonly undo: UndoState | null;
}

export type CraDraftAction =
  | {
      readonly kind: 'setCell';
      readonly rowKey: string;
      readonly day: string;
      readonly value: CellQuantity;
    }
  | {
      readonly kind: 'fillRow';
      readonly rowKey: string;
      readonly workableDays: readonly string[];
      readonly assignableDays: ReadonlySet<string> | null;
      readonly action: string;
      readonly detail: string | null;
    }
  | {
      readonly kind: 'clearRow';
      readonly rowKey: string;
      readonly action: string;
      readonly detail: string | null;
    }
  | { readonly kind: 'removeRow'; readonly rowKey: string }
  | { readonly kind: 'addRow'; readonly rowKey: string }
  | { readonly kind: 'replace'; readonly matrix: MatrixState }
  | {
      readonly kind: 'replaceWithUndo';
      readonly matrix: MatrixState;
      readonly action: string;
      readonly detail: string | null;
    }
  | { readonly kind: 'markSaved' }
  | { readonly kind: 'undo' };

export function createDraftState(matrix: MatrixState): CraDraftState {
  return { matrix, dirty: false, undo: null };
}

export function reduceDraft(state: CraDraftState, action: CraDraftAction): CraDraftState {
  switch (action.kind) {
    case 'setCell':
      return {
        ...state,
        matrix: withValue(state.matrix, action.rowKey, action.day, action.value),
        dirty: true,
      };
    case 'fillRow':
      return {
        matrix: fillEmptyWorkdays(
          state.matrix,
          action.rowKey,
          action.workableDays,
          action.assignableDays,
        ),
        dirty: true,
        undo: { matrix: state.matrix, action: action.action, detail: action.detail },
      };
    case 'clearRow':
      return {
        matrix: clearRow(state.matrix, action.rowKey),
        dirty: true,
        undo: { matrix: state.matrix, action: action.action, detail: action.detail },
      };
    case 'removeRow':
      return { ...state, matrix: removeRow(state.matrix, action.rowKey), dirty: true };
    case 'addRow':
      return { ...state, matrix: addRow(state.matrix, action.rowKey), dirty: true };
    case 'replace':
      return createDraftState(action.matrix);
    case 'replaceWithUndo':
      return {
        matrix: action.matrix,
        dirty: true,
        undo: { matrix: state.matrix, action: action.action, detail: action.detail },
      };
    case 'markSaved':
      return { ...state, dirty: false };
    case 'undo':
      return state.undo === null ? state : { matrix: state.undo.matrix, dirty: true, undo: null };
  }
}
