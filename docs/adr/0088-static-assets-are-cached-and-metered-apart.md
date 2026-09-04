# ADR-0088 — Static assets are cached and metered apart from the application

- **Date**: 2026-09-04
- **Status**: accepted

## Context

Reloading any page of the hosted instance with F5 broke it. The console said, over and over:

```
GET https://erp.clementvallois.fr/assets/tableau-de-bord-CxAG83_T.js   NS_ERROR_CORRUPTED_CONTENT
Loading module from “…/assets/demo-notice-B6nVk7b7.js” was blocked because of a disallowed
MIME type (“text/html”).
```

Every one of those files exists and is served correctly when asked for on its own — verified with
`curl`: `200`, `application/javascript`. The failure is a function of _how many_ are asked for at
once, not _which_.

Two settings combine to produce it, and neither is wrong by itself:

1. `deploy/nginx/erp.clementvallois.fr.conf` metered the whole vhost with one
   `limit_req zone=erp_maquette rate=10r/s burst=20 nodelay`, sized for a person clicking.
2. `apps/api/src/web/spa.ts` served every asset with `@fastify/static`'s default
   `Cache-Control: public, max-age=0` — an instruction to _revalidate every time_, so a reload
   re-requested every chunk of the route rather than reading them from the browser cache.

A cold load of one SPA route fetches the document plus dozens of content-hashed chunks, fired in
parallel in well under a second. Past the twentieth, nginx answered its own **HTML** 503 page. The
browser had asked for a JavaScript module, got `text/html`, and — correctly, under the
`X-Content-Type-Options: nosniff` this application sends — refused to execute it. Measured on the
live instance: 60 parallel requests for one asset returned exactly 20 × `200` then 40 × `503`.

The rate limit was doing precisely what it was configured to do. What was wrong is that one number
was being asked to describe two populations whose request rates differ by an order of magnitude,
only one of which is a human acting.

## Decision

**Static assets get their own cache policy and their own rate-limit zone, both distinct from the
application's.**

- `/assets/*` is answered `Cache-Control: public, max-age=31536000, immutable`. Its filenames carry
  Vite's content hash, so the bytes behind a URL can never change — which is the precondition
  `immutable` states, and the one case where a year-long cache is not a bet.
- `index.html` is answered `Cache-Control: no-cache`, explicitly. It is the one file whose URL is
  stable while its content — the list of chunks to load — changes with every build.
- The vhost gains `location ^~ /assets/` with a second zone at `rate=100r/s burst=200`, while
  `location /` keeps `rate=10r/s burst=20`. The `proxy_set_header` and `proxy_http_version`
  directives move up to the `server` block, since they inherit downward but not sideways between
  sibling locations.

The asymmetry between the two `Cache-Control` answers is why the options are set per-`sendFile`
rather than on the `@fastify/static` registration the two calls share.

## Rejected option

**Raise `burst` on the single existing zone until reloads stop failing.** The obvious one-line fix,
and it is a guess dressed as a number: the right burst is "however many chunks the largest route
happens to split into", which changes with every build and every added dependency, silently, with
this same failure as the symptom. It also raises the ceiling for the traffic the limit actually
exists to bound.

**Leave `/assets/` unmetered, with no `limit_req` at all.** Simpler, and defensible for static
files behind a proxy. Rejected on what this repository is: an internal tool for a firm that sells
security, whose own README argues its CI proves on itself what the firm sells. An unmetered
internet-facing location in that vhost is a paragraph nobody wants to write. A zone at ten times
the human rate is unreachable by a browser and still bounds a scraper.

**Cache assets without touching nginx.** `immutable` alone removes most of the reloads, which is
most of the symptom — and leaves the first visit of every new deployment, when no cache exists yet,
firing the full uncached burst at a limit that still refuses it. The failure would have moved from
"every reload" to "the load right after each deploy", which is worse: rarer, and therefore harder
to believe when reported.

## Reconsideration threshold

Reopen if a single route's chunk count approaches 200 (the new burst), or if the instance ever
serves assets from a CDN or a separate hostname — at which point the vhost stops being the place
this is decided. Reopen the `immutable` half if the build ever emits a file under `/assets/` whose
name is _not_ content-hashed, since that is the precondition, not a preference.

## Consequences

A returning visitor now loads the app from cache and issues a handful of requests instead of
dozens, which is both the fix and a genuinely faster instance. The nightly reset (ADR-0032) is
unaffected: it replaces data, not the bundle.

The cost is a new way to break the site: shipping a non-hashed file under `/assets/` would now be
cached for a year on every browser that saw it, with no way to recall it. Nothing in the build does
that today — Vite hashes everything it emits there, and `apps/web/index.html`'s favicon comment
already records that `public/` (the unhashed path) is not where files go in this project.

A second cost, smaller: two rate-limit zones are two things to reason about during an incident, and
`limit_req_status` is left at nginx's default `503` for both. A monitoring rule that counted 503s
would now need to know which location produced them.
