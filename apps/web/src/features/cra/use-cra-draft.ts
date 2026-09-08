import { useBlocker } from '@tanstack/react-router';
import type { Dispatch } from 'react';
import { useReducer, useState } from 'react';

import { ApiProblemError } from '@/lib/api-client';
import { LABELS } from '@/lib/labels';

import { createDraftState, reduceDraft, type CraDraftAction, type UndoState } from './draft-state';
import { decideGridResync } from './grid-resync';
import { useSaveMonth } from './hooks';
import { entriesFromMatrix, initMatrix, type MatrixState } from './matrix';
import type { CraGridResponse } from './types';

interface LastWrite {
  readonly kind: 'saved' | 'submitted';
  readonly at: string;
}

export interface CraDraftController {
  readonly matrix: MatrixState;
  readonly dirty: boolean;
  readonly undo: UndoState | null;
  readonly dispatch: Dispatch<CraDraftAction>;
  readonly canEdit: boolean;
  readonly savePending: boolean;
  readonly saveFailed: boolean;
  readonly mutationProblem: ApiProblemError['problem'] | null;
  readonly lastWrite: LastWrite | null;
  readonly pendingRemoteData: CraGridResponse | null;
  readonly viewResetSource: CraGridResponse;
  readonly save: (submit: boolean) => Promise<void>;
  readonly discardEditsAndReload: () => void;
  readonly keepEditsAndDismissRemoteConflict: () => void;
}

/** Coordinates the draft with remote saves and navigation; rendering stays in the screen. */
export function useCraDraft(period: string, data: CraGridResponse): CraDraftController {
  const [{ matrix, dirty, undo }, dispatch] = useReducer(reduceDraft, data, (initialData) =>
    createDraftState(initMatrix(initialData)),
  );
  const [lastWrite, setLastWrite] = useState<LastWrite | null>(null);
  const [syncedWith, setSyncedWith] = useState(data);
  const [viewResetSource, setViewResetSource] = useState(data);
  const [pendingRemoteData, setPendingRemoteData] = useState<CraGridResponse | null>(null);
  const saveMonth = useSaveMonth(period);

  const resyncDecision = decideGridResync({
    incoming: data,
    syncedWith,
    dirty,
    pendingRemoteData,
    savePending: saveMonth.isPending,
  });
  if (resyncDecision.kind === 'adopt') {
    setSyncedWith(data);
    setViewResetSource(data);
    dispatch({ kind: 'replace', matrix: initMatrix(data) });
    if (pendingRemoteData !== null) setPendingRemoteData(null);
  } else if (resyncDecision.kind === 'holdAsConflict') {
    setPendingRemoteData(data);
  }

  useBlocker({
    shouldBlockFn: () => {
      if (!dirty) return false;
      return !window.confirm(LABELS.cra.matrix.unsavedChangesConfirm);
    },
    enableBeforeUnload: true,
    disabled: !dirty,
  });

  async function save(submit: boolean): Promise<void> {
    try {
      await saveMonth.mutateAsync({ submit, entries: entriesFromMatrix(matrix) });
      dispatch({ kind: 'markSaved' });
      const now = new Date();
      setLastWrite({
        kind: submit ? 'submitted' : 'saved',
        at: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      });
    } catch {
      // The mutation exposes its typed failure to the screen.
    }
  }

  function discardEditsAndReload(): void {
    if (pendingRemoteData === null) return;
    setSyncedWith(pendingRemoteData);
    setViewResetSource(pendingRemoteData);
    dispatch({ kind: 'replace', matrix: initMatrix(pendingRemoteData) });
    setPendingRemoteData(null);
  }

  function keepEditsAndDismissRemoteConflict(): void {
    if (pendingRemoteData === null) return;
    setSyncedWith(pendingRemoteData);
    setPendingRemoteData(null);
  }

  return {
    matrix,
    dirty,
    undo,
    dispatch,
    canEdit: data.editable && !saveMonth.isPending,
    savePending: saveMonth.isPending,
    saveFailed: saveMonth.isError,
    mutationProblem: saveMonth.error instanceof ApiProblemError ? saveMonth.error.problem : null,
    lastWrite,
    pendingRemoteData,
    viewResetSource,
    save,
    discardEditsAndReload,
    keepEditsAndDismissRemoteConflict,
  };
}
