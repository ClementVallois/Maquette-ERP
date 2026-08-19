import type { Clock } from '@erp/platform';

import type { ApiConfig } from './config.ts';

/**
 * Everything the routes are allowed to reach, gathered in one place: the composition root builds
 * it, and no route constructs its own. It lives in its own file rather than in `server.ts` so a
 * route can name the type without importing the server that registers it.
 */
export interface ServerDependencies {
  readonly config: ApiConfig;
  readonly clock: Clock;
  /**
   * Resolves when the database answers, rejects otherwise. A function rather than a pool, so
   * `/healthz` — which must depend on nothing — is testable without one.
   */
  readonly probeDatabase: () => Promise<void>;
}
