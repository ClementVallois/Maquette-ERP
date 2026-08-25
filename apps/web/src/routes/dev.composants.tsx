import { createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

import { KitchenSink } from '@/kitchen-sink';

/**
 * `/dev/composants` — the kitchen sink, moved here unchanged from `App.tsx` (frontend-plan.md
 * Phase 3's own checkpoint, `docs/open-questions.md` point 5 of the Phase 3 block: "Phase 4 gives
 * the kitchen sink its own route … `KitchenSink` moves unchanged").
 *
 * Deliberately **outside** `_shell` — a deviation from §3's tree, where it is nested under it, and
 * recorded as such in the Phase 4 checkpoint. Three reasons: a kitchen sink behind the session
 * guard would need a persona cookie just to render, defeating its use as an API-free smoke check
 * (`e2e/smoke.spec.ts`); it would gain a sidebar and topbar it was never designed against, breaking
 * comparability with the committed baseline screenshot
 * (`tests/visual/baseline/kitchen-sink.png`); and dev-only tooling has no reason to carry the
 * production shell's chrome at all. Excluded from `config/navigation.ts` — no persona ever sees it
 * in the sidebar (task 4.3).
 */
export const Route = createFileRoute('/dev/composants')({
  component: KitchenSinkRoute,
});

function KitchenSinkRoute(): ReactElement {
  return (
    <main id="main-content">
      <KitchenSink />
    </main>
  );
}
