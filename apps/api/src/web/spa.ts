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
    (request, reply) => sendBuiltAsset(reply, distDir, request.params['*']),
  );
}

/**
 * A named function rather than an inline arrow, for one mechanical reason: the `nosemgrep`
 * directive below suppresses only the line it sits on or the line immediately after it, so it must
 * stay glued to the `sendFile` call. Inline, the call's length put it one Prettier wrap away from
 * the comment, the suppression silently stopped applying, and the SAST gate failed — a trap worth
 * closing structurally instead of by keeping a line under 100 characters forever.
 *
 * Semgrep's `express-res-sendfile` matches this call: an Express rule, on a Fastify sink. The two
 * are not the same call — `@fastify/send` (under `@fastify/static`) roots every read at `root` and
 * refuses a `..` segment and an absolute path before touching the disk. `spa.test.ts` proves that
 * against a secret planted above `distDir`, twice: once on `sendFile` itself, and once through
 * **this** function — which is why it is exported. Neither the route nor `app.inject` can carry a
 * raw `..` to it (Fastify's router refuses the segment, `light-my-request` normalizes it away), so
 * calling it directly is the only way to prove the composed path rather than a resemblance of it.
 * Note that the `assets/` prefix absorbs one level on its own: a caller's `../x` lands inside
 * `distDir`, and it takes `../../x` to aim at anything above it.
 *
 * Suppressed by rule id, on one line only: a `.semgrepignore` entry would blind the whole module
 * to all 292 rules. The id below repeats its last segment, and that is not a typo — the directive
 * must match the id Semgrep *reports*, which appends the rule's own name to its path. The natural
 * short form (`…audit.express-res-sendfile`) is accepted silently and suppresses nothing.
 */
export function sendBuiltAsset(
  reply: FastifyReply,
  distDir: string,
  captured: string,
): FastifyReply {
  // nosemgrep: javascript.express.security.audit.express-res-sendfile.express-res-sendfile
  return reply.sendFile(`assets/${captured}`, distDir, IMMUTABLE_ASSET_CACHING);
}

/**
 * Every file under `/assets/` carries Vite's content hash in its own name (`index-cqrEhFEg.js`),
 * so its bytes can never change without the URL changing with them — which is the precondition
 * `immutable` states, and the one case where a year-long cache is not a bet (ADR-0088).
 *
 * The plugin's default is `max-age=0`, which is a *revalidation* instruction, not a cache: every
 * chunk of every route was re-requested on every reload, each answered `304` after a round trip.
 * That is the request volume the vhost's rate limit was tripping over.
 *
 * Set here per-`sendFile` rather than on the `register` call above, because the same decorator
 * serves `index.html` (`serveSpaShellOrNull`), whose URL is the one thing that does NOT change
 * when its content does. Caching that one would pin a browser to a stale asset graph — the same
 * failure, made permanent.
 */
const IMMUTABLE_ASSET_CACHING = {
  cacheControl: true,
  immutable: true,
  maxAge: 31_536_000_000,
} as const;

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

  // The counterpart to `IMMUTABLE_ASSET_CACHING`, and the reason that constant is not on the
  // `register` call: this URL is stable across every build while its content — the list of hashed
  // chunks to load — changes with each one. `no-cache` still allows a `304`; what it forbids is
  // answering from the cache without asking, which is what would hand a returning visitor an
  // asset graph that no longer exists on the server.
  reply.header('cache-control', 'no-cache');

  // Same Express rule as `sendBuiltAsset`, and a plainer false positive: the filename here is a
  // literal, so there is no user input in the call at all. It began matching only when the third
  // argument was added — the rule keys on the call's shape, not on where its path comes from.
  // nosemgrep: javascript.express.security.audit.express-res-sendfile.express-res-sendfile
  return reply.sendFile('index.html', distDir, { cacheControl: false });
}
