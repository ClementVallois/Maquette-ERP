import type { ReactElement } from 'react';

import { KitchenSink } from '@/kitchen-sink';

// Phase 2's design-system showcase, rendered directly here because TanStack Router does not
// exist yet (Phase 4, frontend-plan.md §3). Phase 4 moves this render to the `dev.composants`
// route (excluded from the production nav) without changing `KitchenSink` itself.
export function App(): ReactElement {
  return <KitchenSink />;
}
