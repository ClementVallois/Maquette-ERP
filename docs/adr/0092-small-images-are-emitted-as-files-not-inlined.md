# ADR-0092 — Small images are emitted as files, never inlined

- **Date**: 2026-09-04
- **Status**: accepted

## Context

QA round 3, item 17, added a company-news module to the dashboard with three illustrations,
`apps/web/src/assets/news-*.svg`, about 1KB each.

The production Content-Security-Policy (`apps/api/src/web/reply.ts`) is
`default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self';
font-src 'self'; connect-src 'self'`. `img-src 'self'` refuses a `data:` URI — the same constraint
`apps/web/index.html`'s favicon comment already records.

Vite inlines any imported asset below `build.assetsInlineLimit`, which defaults to 4096 bytes. All
three illustrations are under it, so a plain `import` turns each into a `data:` URI inside the built
JavaScript, which the browser then refuses to render, in production only — never in `pnpm run dev`,
where Vite's dev server sends no CSP at all. This is precisely the class of defect the served-build
e2e topology exists for (`playwright.config.ts`, `E2E_SERVED_BUILD=1`).

The documented way to force one specific import to be emitted as a file regardless of size is the
`?url` suffix. It did not work here: with `?url`, all three were still base64-encoded inside
`dist/assets/tableau-de-bord-*.js` — checked against real build output, twice, not inferred. The
cause was not established; a plausible suspect is the interaction between this project's `@` alias
and query-suffixed specifiers in this Vite version.

## Decision

**`build.assetsInlineLimit` is a function that returns `false` for the news illustrations and
`undefined` — Vite's default behaviour — for everything else.** One regex, one filename pattern.

Verified on real output: `dist/assets/` contains `news-formation-*.svg`, `news-securite-*.svg` and
`news-team-*.svg` as content-hashed files, and no `data:image/svg` appears in any emitted
JavaScript.

Stated as the general rule this repository follows, because the constraint is not about these three
files: **an image referenced by the application is served from its own origin.** Any future asset
under 4KB has to opt out of inlining the same way, or it will be silently refused in production and
nowhere else.

## Rejected option

**The `?url` import suffix**, which is the idiomatic answer and the one a reader will ask about
first. Rejected on measurement, not on taste: it did not produce emitted files in this project, and
shipping a mechanism that is documented to work but observably does not is worse than shipping the
one that does.

**Raising the mystery to a global `assetsInlineLimit: 0`** was the other option — no inlining
anywhere, no per-file rule, no way to forget. It loses because it silently changes the shape of
every future asset import in the app (each becomes its own request) to solve a problem three files
have, and because the CSP does not forbid inlining in general, only `data:` _images_.

## Reconsideration threshold

Reopen if `?url` starts working on a Vite upgrade — the override is then redundant and one less
config function is worth the change. Reopen also if the count of files needing the exemption passes
roughly a dozen: at that point the regex is tracking a category, and the honest form is a directory
convention (`src/assets/images/**` never inlines) rather than a name pattern.

## Consequences

Cheap: three more HTTP requests on the dashboard, each cached for a year by ADR-0088's
`immutable` policy on `/assets/*`, and the illustrations render under the real CSP.

Expensive: a rule that lives in a build config and is enforced by nothing. A fourth illustration
named something other than `news-*.svg` will inline, pass every local check, pass `pnpm run dev`,
and fail only under the served-build topology — and only visibly, as an image that does not appear,
not as a failing assertion. The CSP violation does surface in the browser console, which
`smoke.spec.ts`'s "boots with no console error" catches for the routes it visits; the dashboard is
one of them.
