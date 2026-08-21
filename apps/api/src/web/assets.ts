import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * The one stylesheet, read once at startup and served from a path that carries its own content
 * hash.
 *
 * **There is no path parameter, and that is the decision.** Serving assets by name — even through
 * a hardened static-file plugin — creates a surface whose whole job is turning a caller's string
 * into a filesystem path. This route's URL is computed here, at boot, from a file this repository
 * ships; a request either matches that exact literal or reaches the 404 handler. Nothing a caller
 * sends is ever joined to a path.
 *
 * The hash in the URL is what lets the response be cached for a year: a changed stylesheet is a
 * changed URL, so there is no stale-cache case to reason about and no cache-busting query to
 * remember.
 */

const HASH_LENGTH = 12;

export interface Asset {
  /** The URL the page links to. Contains the content hash, so it changes when the file does. */
  readonly path: string;
  readonly body: string;
  readonly contentType: string;
  readonly etag: string;
}

function load(fileName: string, contentType: string): Asset {
  // Relative to this module, not to `process.cwd()`: the API is started from the repository root
  // by `pnpm run api` and from `/app` in the container, and a cwd-relative read works in exactly
  // one of those.
  const body = readFileSync(new URL(fileName, import.meta.url), 'utf8');
  const hash = createHash('sha256').update(body).digest('hex').slice(0, HASH_LENGTH);
  const [name, extension] = fileName.split('.');

  return {
    path: `/assets/${name ?? ''}.${hash}.${extension ?? ''}`,
    body,
    contentType,
    etag: `"${hash}"`,
  };
}

export const STYLESHEET: Asset = load('style.css', 'text/css; charset=utf-8');
