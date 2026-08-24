import '@fontsource-variable/inter';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// A relative import, not `@/App`: a same-directory sibling is what the alias is not for — it is
// for deeper imports (`@/lib/x`, `@/components/ui/x`). dependency-cruiser now resolves `@/`
// (docs/open-questions.md, row dated 24/08/2026) but the shortest path for a sibling stays `./`.
import { App } from './App';
import './styles/globals.css';

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
