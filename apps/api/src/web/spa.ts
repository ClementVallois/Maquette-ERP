import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply } from 'fastify';

import { PUBLIC } from '../personas/access.ts';

/**
 * Where `pnpm --filter @erp/web build` writes its output (ADR-0063), computed relative to this
 * module rather than to `process.cwd()` — the same reason `web/assets.ts` reads the stylesheet the
 * same way: `pnpm run api` starts from the repository root and a container may not.
 */
export const DEFAULT_DIST_DIR = fileURLToPath(new URL('../../../web/dist/', import.meta.url));

/**
 * The SPA's built assets and its fallback shell (ADR-0063, front-end plan Phase 9.1).
 *
 * `@fastify/static` is registered with `serve: false` — it contributes only the `reply.sendFile`
 * decorator (still `@fastify/send` underneath, so path traversal is refused by the same hardened
 * code a normal registration would use), no route of its own. Every route the plugin would
 * register carries no `config.access`, and `registerAccessControl`'s `onRoute` hook (`server.ts`)
 * throws at boot for a route that declares none (ADR-0023) — registering the plugin's own route(s)
 * would either crash the process or need an exception carved into that check. The one route below
 * is registered by hand instead, with its own `PUBLIC` declaration, so the invariant never needs
 * an exception and stays true for every route in the process, this one included.
 *
 * **Not a prefix test.** `/assets/*` is an exact route registration matched by Fastify's router —
 * it never inspects `/facture` or `/releve`, so it cannot be the collision Annexe C.9 names. The
 * SPA's other built asset requests (`/assets/index-*.js`, `/assets/index-*.css`, …) all live under
 * this one literal, slash-terminated prefix; nothing outside `/assets/` is served this way.
 */
export function registerSpa(app: FastifyInstance, distDir: string = DEFAULT_DIST_DIR): void {
  void app.register(fastifyStatic, { root: distDir, serve: false });

  app.get<{ Params: { '*': string } }>(
    '/assets/*',
    {
      config: {
        access: PUBLIC('a built JS/CSS/asset file carries no more than its own content'),
      },
    },
    // Semgrep's `express-res-sendfile` matches this line: an Express rule, on a Fastify sink. The
    // two are not the same call — `@fastify/send` (under `@fastify/static`) roots every read at
    // `root` and refuses a `..` segment and an absolute path before touching the disk, which
    // `spa.test.ts`'s "never reads outside dist, even when the captured segment is a literal `..`"
    // proves against a secret planted one level above `distDir`, driving `sendFile` directly so
    // that URL normalization cannot be what passes the test. Suppressed by rule id, on this line
    // only: a `.semgrepignore` entry would blind the whole module to all 292 rules.
    //
    // The id below repeats its last segment, and that is not a typo — the directive must match the
    // id Semgrep *reports*, which appends the rule's own name to its path. The natural short form
    // (`…audit.express-res-sendfile`) is accepted silently and suppresses nothing.
    // nosemgrep: javascript.express.security.audit.express-res-sendfile.express-res-sendfile
    (request, reply) => reply.sendFile(`assets/${request.params['*']}`),
  );
}

/**
 * The SPA fallback proper: `server.ts`'s not-found handler calls this for a `GET`/`HEAD` request
 * whose representation is `html` (`web/representation.ts`) — every path that is not `/api/*`, an
 * asset, `/healthz`, `/readyz`, or one of the two printable routes (those are matched by their own
 * registration and never reach the not-found handler at all).
 *
 * Returns `null`, never throwing or sending a response, when `dist/index.html` does not exist —
 * every environment that has not run the web build, which is every test in this repository except
 * the e2e suite from Phase 9.6 onward. The caller falls through to the ordinary 404 in that case.
 * A plain existence check on one fixed literal path, not a `sendFile` call whose failure would
 * have to call `reply.callNotFound()` a second time on a reply the not-found handler is already
 * producing.
 */
export function serveSpaShellOrNull(
  reply: FastifyReply,
  distDir: string = DEFAULT_DIST_DIR,
): FastifyReply | null {
  if (!existsSync(`${distDir}index.html`)) return null;

  return reply.sendFile('index.html', distDir);
}
