import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev topology, fixed in ADR-0063 §"Task 0.3": Vite is the browser's origin
// (http://127.0.0.1:5173), and proxies every path Fastify actually serves to
// http://127.0.0.1:3000. This list has to be kept in step with Fastify's own routes by hand —
// ADR-0063 names that as the topology's one ongoing cost.
const API_ORIGIN = 'http://127.0.0.1:3000';
const PROXIED_PATHS = ['/api', '/facture', '/releve', '/healthz', '/readyz'];

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
