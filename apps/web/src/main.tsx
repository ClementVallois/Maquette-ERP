import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { config as configureZod } from 'zod';

// A relative import, not `@/App`: a same-directory sibling is what the alias is not for — it is
// for deeper imports (`@/lib/x`, `@/components/ui/x`). dependency-cruiser now resolves `@/`
// (docs/open-questions.md, row dated 24/08/2026) but the shortest path for a sibling stays `./`.
import { App } from './App';
import './styles/globals.css';

// Not a bare `new Error()` (BUILD-RULES § Working discipline, `no-restricted-syntax` in
// eslint.config.js): a typed technical failure, thrown once, at the one place a missing
// `#root` would otherwise be a silent no-op.
class MissingRootElementError extends Error {}

// Zod 4 compiles a schema's validator with `Function()` when it can, and decides whether it can by
// calling `Function('')` inside a try/catch. Under our CSP (`script-src 'self'`, no
// `'unsafe-eval'` — ADR-0072) that call is refused, Zod catches it and falls back to its
// interpreted path, and everything works: the only casualty is a `Content-Security-Policy` line
// the browser logs before the catch runs, which reads in the console exactly like a real
// violation. Telling Zod up front removes the probe, and with it the false alarm. Set here, at the
// entry module, so it is in force before any route chunk evaluates a schema.
configureZod({ jitless: true });

const container = document.getElementById('root');
if (container === null) {
  throw new MissingRootElementError('#root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
