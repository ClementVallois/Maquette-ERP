import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ComingSoon } from '@/components/shell/coming-soon';

export const Route = createFileRoute('/_shell/mes-notes-de-frais')({
  component: MesNotesDeFraisRoute,
});

function MesNotesDeFraisRoute(): ReactElement {
  return <ComingSoon />;
}
