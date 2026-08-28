import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev topology, fixed in ADR-0063 §"Task 0.3": Vite is the browser's origin
// (http://127.0.0.1:5173), and proxies every path Fastify actually serves to
// http://127.0.0.1:3000. This list has to be kept in step with Fastify's own routes by hand —
// ADR-0063 names that as the topology's one ongoing cost.
//
// `/facture/` and `/releve/` carry a trailing slash on purpose, `/api` and the two health
// endpoints do not. Vite's dev proxy (`http-proxy`, via Vite's own `server.proxy`) matches a
// string context as "the request path starts with this", so `/facture` (no slash) would also
// match `/factures` — the SPA's own plural invoice list (Annexe C.9: "jamais de collision" is
// about the two routes never sharing a URL, and this is the collision the rule did not cover, a
// dev-proxy prefix match rather than a route). Found live building Phase 8, task 8.1: a full
// navigation to `/factures` (`page.goto`, or a browser refresh/typed URL — never a client-side
// `<Link>`, which never leaves the SPA to be proxied at all) answered the API's own
// `/problems/not-found` page instead of the SPA shell. Both SSR routes are always `/:id`-suffixed
// (`apps/api/src/web/routes.ts`) and never reached bare, so the trailing slash costs nothing on
// the paths that are supposed to match.
const API_ORIGIN = 'http://127.0.0.1:3000';
const PROXIED_PATHS = ['/api', '/facture/', '/releve/', '/healthz', '/readyz'];

export default defineConfig({
  // Tailwind v4 is CSS-first (no tailwind.config.*): the plugin reads `@import "tailwindcss"`
  // from src/styles/globals.css and needs no options here.
  //
  // `tanstackRouter` must run before `react()` (its own documented ordering): it rewrites
  // `routes/**` into `src/routeTree.gen.ts` before the React plugin's Babel/SWC pass sees the
  // route files. `target: 'react'` selects the React adapter; `autoCodeSplitting: true` is
  // Phase 10.3's lazy-route splitting, taken now rather than retrofitted, since turning it on
  // later would regenerate every route file's code-split boundary anyway.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), tailwindcss(), react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // No `changeOrigin`: the browser's `Origin` header (http://127.0.0.1:5173, matching
    // `API_PUBLIC_ORIGIN` in dev) passes through the proxy unchanged either way — `changeOrigin`
    // only rewrites the outgoing `Host` header, which the API's origin check never reads.
    proxy: Object.fromEntries(PROXIED_PATHS.map((path) => [path, { target: API_ORIGIN }])),
  },
});
