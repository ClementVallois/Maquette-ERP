import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { AssignmentScreen } from '@/features/affectations/components/assignment-screen';

export const Route = createFileRoute('/_shell/affectations')({ component: AffectationsRoute });

function AffectationsRoute(): ReactElement {
  return <AssignmentScreen />;
}
