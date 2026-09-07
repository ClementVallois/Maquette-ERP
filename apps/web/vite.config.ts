import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vite owns the development origin and proxies Fastify-owned paths. The printable prefixes keep
// their trailing slash so `/facture/` cannot capture the SPA's `/factures`; the stylesheet prefix
// is narrowed so Vite assets remain local. Keep this list aligned with Fastify's public routes.
const API_ORIGIN = 'http://127.0.0.1:3000';
const PROXIED_PATHS = ['/api', '/facture/', '/releve/', '/assets/style.', '/healthz', '/readyz'];

export default defineConfig({
  // Tailwind v4 is CSS-first (no tailwind.config.*): the plugin reads `@import "tailwindcss"`
  // from src/styles/globals.css and needs no options here.
  //
  // `tanstackRouter` must run before `react()` (its own documented ordering): it rewrites
  // `routes/**` into `src/routeTree.gen.ts` before the React plugin's Babel/SWC pass sees the
  // route files. `target: 'react'` selects the React adapter; `autoCodeSplitting: true` is
  // lazy-route boundaries before React transforms the generated modules.
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), tailwindcss(), react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    // ADR-0092: an image the app references is served from its own origin, never inlined as a
    // `data:` URI, which the production CSP's `img-src 'self'` refuses. The trap this guards is
    // that it is invisible outside a production build — `pnpm run dev` sends no CSP — and that
    // `?url`, the documented per-import opt-out, does not work in this project.
    assetsInlineLimit: (filePath) => (/\/news-[^/]+\.svg$/u.test(filePath) ? false : undefined),
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
