import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// A relative import, not `@/App`: a same-directory sibling is what the alias is not for — it
// exists for the deeper imports Phase 3+ will write, and dependency-cruiser (`.dependency-cruiser.cjs`)
// resolves against `tsconfig.base.json` at the repo root, which carries no `@/` mapping of its own.
import { App } from './App';

// Not a bare `new Error()` (BUILD-RULES § Working discipline, `no-restricted-syntax` in
// eslint.config.js): a typed technical failure, thrown once, at the one place a missing
// `#root` would otherwise be a silent no-op.
class MissingRootElementError extends Error {}

const container = document.getElementById('root');
if (container === null) {
  throw new MissingRootElementError('#root is missing from index.html');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
