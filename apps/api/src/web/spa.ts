import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply } from 'fastify';

import { PUBLIC } from '../personas/access.ts';

/** The web build output, resolved independently from the process working directory. */
export const DEFAULT_DIST_DIR = fileURLToPath(new URL('../../../web/dist/', import.meta.url));

/**
 * Register hashed SPA assets without letting the static plugin create undeclared routes. Fastify
 * owns the explicit `/assets/*` route, so the access-control registration invariant still applies.
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
 * Send a captured asset through `@fastify/send`, rooted at `distDir`. The focused Semgrep
 * suppression is for an Express-rule false positive; traversal refusal is covered by spa.test.ts.
 */
export function sendBuiltAsset(
  reply: FastifyReply,
  distDir: string,
  captured: string,
): FastifyReply {
  // nosemgrep: javascript.express.security.audit.express-res-sendfile.express-res-sendfile
  return reply.sendFile(`assets/${captured}`, distDir, IMMUTABLE_ASSET_CACHING);
}

/** Vite hashes asset URLs, so assets can be immutable while the stable shell URL cannot. */
const IMMUTABLE_ASSET_CACHING = {
  cacheControl: true,
  immutable: true,
  maxAge: 31_536_000_000,
} as const;

/** Serve the SPA shell for HTML fallbacks, or return `null` when no web build is present. */
export function serveSpaShellOrNull(
  reply: FastifyReply,
  distDir: string = DEFAULT_DIST_DIR,
): FastifyReply | null {
  if (!existsSync(`${distDir}index.html`)) return null;

  // The stable shell URL must revalidate because its hashed asset graph changes between builds.
  reply.header('cache-control', 'no-cache');

  // Express-rule false positive: both filename and root are trusted server values.
  // nosemgrep: javascript.express.security.audit.express-res-sendfile.express-res-sendfile
  return reply.sendFile('index.html', distDir, { cacheControl: false });
}
