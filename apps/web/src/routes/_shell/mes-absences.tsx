import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ComingSoon } from '@/components/shell/coming-soon';

export const Route = createFileRoute('/_shell/mes-absences')({
  component: MesAbsencesRoute,
});

function MesAbsencesRoute(): ReactElement {
  return <ComingSoon />;
}
