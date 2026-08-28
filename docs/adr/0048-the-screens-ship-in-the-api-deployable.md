# ADR-0048 — The screens ship inside the API deployable, and `apps/api` keeps its name

- **Date**: 2026-08-21
- **Status**: superseded by ADR-0063

## Context

Phase 6 builds the four screens ADR-0009 named. The branch is `feat/web` and the commit scope
`web` has existed since task 0.2, both of which read as though a second application were about to
appear next to `apps/api`. Nothing has ever decided that, and the question has to be answered
before the first file is written, because it decides which arrows are legal.

Three facts already in the repository point the same way, and they were established for other
reasons:

- **The dependency whitelist grants an app only its own tier-mate directory.** The entry is
  `{ from: '^apps/([^/]+)/', to: '^apps/$1/' }` — inside **one** app. There is no
  `apps/web → apps/api` arrow, and `no-module-to-app` plus the single cross-tier grant
  (`^apps/` → a module's `src/index.ts`) is the whole of what an app may reach.
- **`@erp/api`'s public surface is three exports**: the configuration loader, the UUIDv7 factory
  and the event store, each published for a named reason (ADR-0041, ADR-0020). A separate `apps/web`
  would need `ServerDependencies`, `transactionally`, the persona catalogue, the access hook and
  the problem mapper. Widening the index to carry all of that would make "one `index.ts` is the
  only public surface" a sentence about a file rather than about a boundary.
- **ADR-0009 already said it**, in a clause that reads as incidental until this question is asked:
  "**a versioned `/api/v1` returns JSON for the same use cases**". The same use cases, two
  representations — that is one server with two renderers, not two servers.

Phase 8 confirms it from the other end: 8.5 builds **one** multi-stage Dockerfile with **one**
`HEALTHCHECK` hitting `/healthz`, and 8.6's `compose.prod.yml` runs app plus Postgres. Two
deployables would have been two containers, two health probes and a network hop between a screen
and the transaction it renders.

## Decision

**There is one deployable. The screens live in `apps/api/src/web/`, registered onto the same
Fastify instance as `/api/v1`, and `apps/api` keeps its directory name and its package name.**

The naming drift is stated rather than left to be noticed: **`apps/api` is now narrower than what
it holds.** It is the composition root and the HTTP edge — every representation the process serves,
JSON and HTML alike. The `package.json` description says so as of this commit.

What separates the two renderers is a directory and a content type, not a boundary:
`src/routes/` answers `application/json` and `application/problem+json`, `src/web/` answers
`text/html`. Both go through the same `preHandler` access declaration, the same `Origin` check,
the same `transactionally`, and the same typed refusals — which is the point. A refusal a screen
shows and a refusal the API returns are **the same object**, rendered twice, and there is no second
error vocabulary to keep in step.

## Rejected option

**`apps/web` as a second deployable, calling `/api/v1` over HTTP.** It is the shape the branch name
suggests and the one a reader expects from the directory layout. It loses on three counts, in
descending order of weight:

1. **It buys a boundary this repository already has, and pays for it twice.** The boundary being
   demonstrated is `timesheet` ⇄ `billing`, and it is enforced by a machine. A second boundary
   between a screen and its own API is enforced by nothing but a port number, and ADR-0009 rejected
   Next.js for exactly this — a soft, unverified boundary standing next to the verified one dilutes
   the demonstration rather than adding to it.
2. **The persona cookie would have to cross it.** ADR-0023's cookie is signed, `HttpOnly` and
   `SameSite=Strict`; a server-to-server hop means either forwarding it (the screen server now
   holds every visitor's session credential) or a second trust mechanism between the two processes
   (a shared secret in the deploy, which ADR-0029 spent its whole reasoning keeping out of CI).
   Both are worse than not having the hop.
3. **It would double the authorization surface for no gain.** Three loci is already the number
   ADR-0023 had to justify; a fourth, in a process that could not see the repository, would be a
   role comparison in a handler body — the exact thing BUILD-RULES forbids by name.

**Renaming `apps/api` to `apps/erp` or `apps/server`.** Honest about the contents, and genuinely
tempting. It loses on cost against benefit: the name appears in `vitest.config.ts`, two
dependency-cruiser globs, four `package.json` scripts, the CI workflow, `scripts/seed.ts`'s import,
`.env.example`, the README's start instructions and ADR-0015's own text. Every one of those is a
place the rename can be done wrong, in a phase whose deliverable is screens. The name is
**inaccurate and stated**, which this repository treats as a different thing from inaccurate and
silent — and a reader who greps `apps/api` finds this ADR at the top of the directory it names.

**`scripts/` as a precedent for the other shape.** `scripts/` does get
`^apps/[^/]+/src/index\.ts$`, so a tier-mate reaching an app's public index is not unheard of here.
It does not transfer: `scripts/` reaches for two exports that are deliberately public (a
deterministic id factory and an event store, both published so the seed writes what the running
system writes). A screen server would reach for the composition root itself.

## Consequences

**Easy.** A screen renders from the same `transactionally` the API uses, so it reads through the
repository that decides scope — a screen cannot see a record the API would refuse, because it is
the same refusal. `fastify.inject` tests the screens exactly as it tests the routes, with no second
harness. Phase 8 ships one image.

**Expensive.** `apps/api` grows: it now holds the composition root, the API, the renderer and the
screens, and it is the largest directory in the repository. The internal shape that keeps that
legible is three directories with one direction of flow: `src/http/` is the shared edge and knows
both representations, `src/routes/` writes JSON, `src/web/` writes HTML, and **neither of the last
two imports the other**. `src/routes/` does reach the renderer transitively, through
`http/reply.ts` — that is not a leak but the design: the representation switch is the one place
that decides whether a refusal becomes `problem+json` or a page, and it belongs on the shared edge
rather than duplicated on each side.

The direction is a convention, and convention is the honest word: it is not machine-enforced,
because dependency-cruiser's rules here are between **packages**, and an intra-package rule would
be the first of its kind. The phase checkpoint says whether it held.

The second cost is the naming one, carried deliberately: a cold reader meets a directory called
`api` that serves HTML. `docs/adr/README.md` and the package description are where they find out
why, and the `cold-reader` audit before the repository link goes out is where it gets checked.

## Reconsideration threshold

Reopen at the first consumer of these screens' data that is **not** this process — a second
front-end, a mobile client, a partner integration. That is also ADR-0015's threshold ("a second
deployable needs to share non-domain code") reached from the other side, and it is the point at
which the rendering helpers of ADR-0025 become shared code rather than local code.

Reopen sooner if `apps/api/src/web/` ever needs something from `src/routes/` that is not a pure
function — a shared handler, a shared piece of state. That would mean the two renderers are one
application in the wrong shape, and the answer then is a third tier, not a second app.
