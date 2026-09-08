import { createFileRoute, notFound } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { KitchenSink } from '@/kitchen-sink';

export const Route = createFileRoute('/dev/composants')({
  beforeLoad: () => {
    // TanStack Router recognises its plain-object not-found sentinel; it is intentionally not Error.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    if (!import.meta.env.DEV && import.meta.env['VITE_DEV_ROUTES'] !== '1') throw notFound();
  },
  component: KitchenSinkRoute,
});

function KitchenSinkRoute(): ReactElement {
  return (
    <main id="main-content">
      <KitchenSink />
    </main>
  );
}
