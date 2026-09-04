import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { ComingSoon } from '@/components/shell/coming-soon';

export const Route = createFileRoute('/_shell/mes-informations')({
  component: MesInformationsRoute,
});

function MesInformationsRoute(): ReactElement {
  return <ComingSoon />;
}
