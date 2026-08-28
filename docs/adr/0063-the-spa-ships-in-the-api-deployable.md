# ADR-0063 — The SPA ships in the API deployable, as build output, and same-origin stays forced

- **Date**: 2026-08-24
- **Status**: accepted

## Context

> Phase numbers here come from two unrelated sequences: **BUILD-PLAN Phase N** is
> `docs/BUILD-PLAN.md`, **front-end plan Phase N** is `docs/frontend-plan.md`. Both are cited
> below and each is named.

ADR-0048 (21/08/2026) decided there is one deployable for this repository, ahead of BUILD-PLAN
Phase 6's screens: the dependency-cruiser whitelist grants an app only its own tier-mate directory
(`{ from: '^apps/([^/]+)/', to: '^apps/$1/' }`, and no `apps/web → apps/api` entry existed or
exists); `@erp/api`'s public surface was three exports, not the composition root itself; and
ADR-0009 had already called the API and the screens "the same use cases, two representations."

ADR-0062 now creates the second half of that layout question: `apps/web` exists as a workspace
member. `pnpm-workspace.yaml` already globs `apps/*` (ADR-0015, "declared before it is populated")
so adding the directory needs no workspace-config change — but its existence reopens exactly the
question ADR-0048 settled by name: is `apps/web` the second deployable ADR-0048 rejected, or
something else?

## Decision

**It is something else, and there is still one deployable.** `apps/web` is a **build-time-only**
workspace member: `vite build` produces static assets (`apps/web/dist`), and Fastify — the same
process, the same composition root — serves them same-origin alongside `/api/v1` and the two
printable routes (front-end plan Phase 9.1, `@fastify/static` with a SPA fallback for any `GET` that is not
`/api/*`, `/facture/:id`, `/releve/:id`, `/healthz` or `/readyz`). `apps/web` has no runtime server
of its own in production; in development it runs Vite's dev server as a second local process,
proxying rather than serving. `apps/api` keeps composing everything, keeps its one health probe,
and keeps its name — the naming-drift ADR-0048 accepted ("`apps/api` is now narrower than what it
holds") widens rather than resolves: the directory now also serves HTML it did not itself render.

**`apps/web` talks to the backend only over HTTP, on the same origin.** It never imports
`apps/api`; the two claims below are separate and should not be read as one rule with two
phrasings. First, mechanical: the whitelist's cross-tier grant (`^apps/` → any package's
`^packages/[^/]+/src/index\.ts$`) is package-agnostic, so dependency-cruiser would let `apps/web`
import the public index of `@erp/platform` or `@erp/api` just as readily as `@erp/contracts` — the
rule does not single one out. Second, discipline: `@erp/contracts` (`ProblemDetails`,
`API_PROBLEM_TYPES`) is the only package `apps/web` needs and will import, per `frontend-plan.md`
§2 — a client that only ever talks HTTP has no reason to reach for `@erp/platform`'s domain
vocabulary or `@erp/api`'s composition root, and nothing here stops a future import from doing so
except the same discipline that already governs `scripts/`'s narrower reach.

Of ADR-0048's three arguments against a second deployable:

1. **"Buys a boundary this repository already has, paid twice" — retires as literally stated,
   holds in substance.** There is now a real network hop in development (browser → Vite dev
   server → proxy → Fastify), which ADR-0048 did not have to reason about. But the boundary the
   argument protected — no soft, unverified separation standing next to the verified `timesheet`
   ⇄ `billing` one — still holds, verified against `.dependency-cruiser.cjs`: the whitelist grants
   a tier-mate only its own directory (`^apps/([^/]+)/ → ^apps/$1/`), so there is **no**
   `apps/web → apps/api` arrow, granted or ungranted-but-possible; `apps/web` cannot reach
   `apps/api`'s internals even at build time, and dependency-cruiser fails the build if it tries.
   If anything this is a stronger check than ADR-0048 had to make, because now there is a second
   directory that could tempt the import and a rule that refuses it mechanically rather than one
   that was never tested because the directory did not exist.
2. **"The persona cookie would have to cross it" — retires.** In production there is no
   server-to-server hop: the browser talks to the one Fastify process that has always issued and
   read the cookie. In development, the browser only ever talks to the Vite dev server
   (`http://127.0.0.1:5173`); Vite's proxy forwards the request to Fastify and relays the
   response, `Set-Cookie` included, back as if it came from the page's own origin — the cookie is
   never forwarded between two trust domains, it is issued once, to the one origin the browser
   holds a session with. `apps/api/src/personas/cookie.ts` sets no `Domain` attribute (`Path=/`,
   `HttpOnly`, `SameSite=Strict`), so this holds without any extra configuration.
3. **"Doubles the authorization surface for no gain" — retires, unchanged in substance.**
   `apps/web` decides nothing about authorization. It reads role-scoped data the API already
   refused or granted, and renders a refusal it did not itself adjudicate (`frontend-plan.md` §2,
   "l'offre suit le rôle" — a button renders only if the session role carries the action, same
   discipline the server-rendered screens already used with `carries(access, role)`).

ADR-0048's other two rejected options — renaming `apps/api`, and `scripts/`'s narrower grant as a
precedent — are untouched here; neither is reopened by this decision.

**Task 0.3 — the two topologies, recorded verbatim.**

The `Origin` check (`apps/api/src/personas/access.ts`, `registerOriginCheck`) compares the
request's `Origin` header — the **browser's** origin — against `dependencies.config.publicOrigin`,
i.e. `API_PUBLIC_ORIGIN`, and refuses a mismatch or an absence on every state-changing method.
`API_PUBLIC_ORIGIN` is validated by `config.ts` against `/^https?:\/\/[^/\s]+$/`: a bare scheme
and host, no path, no trailing slash. The persona cookie is `SameSite=Strict` (`cookie.ts`), so a
browser will not attach it to a request whose top-level origin differs from the one that issued
it, regardless of any `Access-Control-Allow-Origin` header a server might send. Both controls are
enforced independently of each other; together they mean `apps/web` must be **same-origin** with
the API it calls, in every environment, or every write it sends is refused and every cookie-bearing
read is sent without the cookie.

- **Dev**: the browser's origin is the Vite dev server, `http://127.0.0.1:5173`. `vite.config.ts`
  proxies `/api`, `/facture`, `/releve`, `/healthz` and `/readyz` to `http://127.0.0.1:3000`. The
  dev `.env` sets `API_PUBLIC_ORIGIN=http://127.0.0.1:5173` — the value the _browser_ presents,
  not the port Fastify actually listens on. Two terminals: `pnpm run api:dev` and
  `pnpm --filter @erp/web dev`.
- **Prod/demo**: Fastify serves `apps/web/dist` on port 3000; `API_PUBLIC_ORIGIN=http://127.0.0.1:3000`
  (or the public origin, e.g. `https://erp.clementvallois.fr`, once BUILD-PLAN Phase 8 hosts it). One origin,
  no CORS, the cookie unchanged.

## Rejected option

**`apps/web` as a second deployable, calling `/api/v1` over HTTP** — ADR-0048's original rejected
option, reopened here because `apps/web` now genuinely exists, and rejected again on the same
three grounds, now checked against real code instead of anticipated: the cookie cannot cross a
real network hop without either forwarding a visitor's session credential to a second process or
standing up a second trust mechanism between them (ADR-0048's argument, unchanged); the
`SameSite=Strict` + `Origin`-equality pair verified above means a cross-origin `apps/web` would
refuse its own writes outright, not merely add risk — this is not a preference, it is what the
code currently does to any request whose origin differs from `API_PUBLIC_ORIGIN`.

**Adding CORS headers so `apps/web` can be cross-origin in production, on its own port or host.**
The naive fix for the above, and worth rejecting by name because someone will propose it:
`Access-Control-Allow-Origin` only relaxes the browser's script-readability of a cross-origin
response — it does nothing to the two controls that actually block the request here.
`SameSite=Strict` still withholds the cookie on a cross-site request regardless of any CORS
header, and `registerOriginCheck` still compares the raw `Origin` header, which CORS does not
touch. Enabling CORS would add a header that changes nothing about the two live decisions and add
exactly the exposure — the API now has to reason about an explicit list of trusted origins — that
`frontend-plan.md` §0 already ruled out by name: "il n'y a pas de CORS, et il n'y en aura pas."

## Reconsideration threshold

Reopen at the first consumer of this API that is **not** this SPA's own build — a second
front-end, a mobile client, a partner integration — which is the same threshold ADR-0048 named,
from the same side: a second, independently deployed caller is exactly what a same-origin,
same-process SPA is not.

Reopen sooner if `apps/web` ever needs a runtime server of its own — SSR, streaming, anything
beyond `vite build`'s static output — because "build-time member, statically served by the
composition root" is the specific claim this ADR makes, and a runtime Node process for `apps/web`
would be the second deployable ADR-0048 and this ADR both reject, arrived at from a different
direction.

## Consequences

**Easy.** One image, one health probe, one process to reason about in BUILD-PLAN Phase 8 — unchanged from
ADR-0048. Same-origin means no CORS configuration exists to get wrong, and the persona cookie's
`SameSite=Strict` keeps doing its job without a second cookie-forwarding mechanism to audit.

**Expensive.** Development now needs two local processes instead of one (`api:dev`, `web dev`),
and the Vite proxy list (`/api`, `/facture`, `/releve`, `/healthz`, `/readyz`) is a second place
that has to be kept in step with whatever routes Fastify actually serves — a proxied path Fastify
stops serving, or a new one it starts serving, is a manual edit in `vite.config.ts` with nothing to
catch a drift between the two. Front-end plan Phase 9.1 adds a SPA-fallback route to Fastify that has to stay
correctly ordered ahead of the catch-all against the two printable, always-priority routes — a
routing responsibility `apps/api` did not previously carry.
