# ADR-0064 — The Content-Security-Policy admits a script, scoped to `'self'`

- **Date**: 2026-08-24
- **Status**: accepted

## Context

> Phase numbers below are the **front-end plan**'s (`docs/frontend-plan.md`), not
> `docs/BUILD-PLAN.md`'s; the two sequences are unrelated and each citation names its plan.

ADR-0049 (21/08/2026) set the strictest CSP available at the time — `default-src 'none'` with
`style-src 'self'`, `img-src 'self'`, `form-action 'self'`, `base-uri 'none'`,
`frame-ancestors 'none'` — as a claim checkable from outside the repository: `script-src` fell to
`default-src 'none'`, which was ADR-0009's "no client framework" restated in a form `curl -I`
reports rather than merely asserts.

ADR-0049 also wrote its own condition for reopening, explicitly, as the reason it rejected a
looser policy: **"A permissive policy with `script-src 'self'`, leaving room for a script later"
was rejected as "reserving room for a decision not taken"** — with the remedy named in the same
breath: "If a screen ever needs a script, that is ADR-0009's reconsideration threshold and this
header changes in the same commit as the script — visibly, in a diff, with a reason."

ADR-0062 has now taken that decision: React ships for every interactive screen. This ADR is the
answer ADR-0049 asked for, on its own terms — not a policy chosen in anticipation of a script that
might come, but a policy chosen because the script has now been decided, in the same movement
(both ADRs are dated 24/08/2026, and this one exists specifically because ADR-0062 does). The
header does not change in the same _commit_ as the code, because this repository's discipline puts
the ADR before the code (`CLAUDE.md`, "Clement owns the decisions; the agent writes the code" — an
ADR is written at the time a decision is made, not at the time it is implemented); it changes in
the same _Phase 0 record_, ahead of front-end plan Phase 1's first line of `apps/web`, which is
the same visibility ADR-0049 asked for, applied to a repository that writes its decisions down
before its code.

## Decision

**The Content-Security-Policy admits `script-src 'self'`.** The exact string is frozen for
front-end plan Phase 9.2 and copied here so the two cannot drift:

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self';
font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self';
frame-ancestors 'none'
```

Nine clauses, one policy for every response — JSON included, `apps/api/src/web/reply.ts`'s
`registerSecurityHeaders` hook, unchanged in that respect. Three clauses are new relative to
ADR-0049's six:

- **`script-src 'self'`** — the decision itself: the SPA's own bundle, self-hosted, and nothing
  else. No CDN, no inline `<script>`, no hash list.
- **`font-src 'self'`** — front-end plan Phase 2.2 self-hosts the interface font rather than
  pulling it from a CDN, matching the supply-chain posture ADR-0049 already argued for style and
  script ("a font loaded from a CDN would be the one unaudited byte in the page").
- **`connect-src 'self'`** — the SPA's own `fetch` calls to `/api/v1`, restricted to the one
  origin the SPA is architecturally confined to anyway: ADR-0063's `Origin` check and
  `SameSite=Strict` cookie already forbid a cross-origin call from succeeding, and
  `connect-src 'self'` makes the browser refuse to even attempt one.

The six unchanged clauses carry ADR-0049's reasons forward untouched: `default-src 'none'` remains
the base; `style-src 'self'` still forbids the inline `style` attributes ADR-0025 already refuses
to interpolate into; `img-src 'self'`, `base-uri 'none'` and `frame-ancestors 'none'` are unrelated
to script and unaffected by it; `form-action 'self'` still closes the exfiltration route for every
write, whether it arrives as a form post from the two printable pages or a `fetch` from the SPA.

**This string is frozen in front-end plan Phase 9.2, and no code changes here.**
`apps/api/src/web/reply.ts`'s `CONTENT_SECURITY_POLICY` constant still reads the ADR-0049 string
today; that phase replaces it with the string above, and `routes.test.ts`'s assertion on the
exact header value changes there, not here. This ADR exists so the plan's copy
(`frontend-plan.md` §9.2) and the eventual code cannot drift apart between now and then — one
frozen string, cited from two places, changed in one commit when that phase lands.

The three companion headers ADR-0049 set are unaffected by this decision and stay as
`apps/api/src/web/reply.ts` currently sets them: `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, and `Referrer-Policy: same-origin`. That last value is worth naming
exactly rather than repeating ADR-0049's text, because ADR-0049 named `no-referrer` and the running
code does not use it — commit `74895c2` ("the app refused its own form posts, and no test could
see it") found that `no-referrer` makes Fetch send `Origin: null` on every non-`GET` navigation,
same-origin submissions included, which `registerOriginCheck` then refused as a mismatch: the
strictest referrer policy was silently breaking every write the screens made. `same-origin` keeps
`no-referrer`'s actual goal — nothing crosses to a third party — while leaving same-origin
submissions their real `Origin`, which is what the CSRF control in ADR-0063 depends on.

That fix predates this ADR and this ADR does not change it. What this ADR does change is the
record: the `docs/open-questions.md` row of 23/08/2026 that reported the defect closes with
"⚠️ **ADR-0049 names `no-referrer` literally and is not rewritten** — it owes a superseding note".
This is that note. ADR-0049 is superseded here in full, header list included, so the value a reader
finds in this ADR is the value `reply.ts` actually sets; ADR-0049 keeps its own text, as an ADR
always does, and the debt the 23/08 row recorded is discharged rather than carried forward.

## Rejected option

**Leave the CSP as ADR-0049 wrote it, and let front-end plan Phase 9 add `script-src 'self'`
unilaterally when the code lands.** This is the option ADR-0049 itself rejected in advance, and rejecting it again here
is not redundant: doing nothing now would mean two ADRs simultaneously accepted on `main` making
contradictory claims about the same header the moment `apps/web`'s first commit lands and nobody
has yet written the ADR that says why — precisely the gap ADR-0045 exists to close, arrived at by
omission this time instead of error.

**A hash list, or `'unsafe-inline'`, for convenience during front-end plan Phases 1 to 8 while
`apps/web` is being built.** Rejected for the reason ADR-0049 already gave and this ADR inherits unchanged: an
exception granted for temporary convenience outlives the reason it was granted for. `script-src
'self'` is exactly as strict as ADR-0009's original claim was, applied to a stack that now
legitimately ships a script instead of none.

## Reconsideration threshold

Reopen the **"one policy for every response"** half if the policy ever needs to differ per
environment — unchanged from ADR-0049: a staging instance embedding the app in an internal portal
would need `frame-ancestors` loosened, and a per-environment header belongs in configuration or at
the proxy, not compiled into the code.

Reopen `script-src` beyond `'self'` only when a specific third-party script is genuinely needed —
an analytics tag, a payment widget — and even then as a single named host added in a diff with a
reason, never a wildcard and never `'unsafe-inline'`. This repository's CI already runs a
dependency scan and a secret scan; a third-party script host is the equivalent unaudited surface
for markup that ADR-0049 already refused for fonts.

## Consequences

**Easy.** `curl -I` still demonstrates the policy in one line, but now demonstrates that the
application runs exactly one self-hosted bundle and nothing else, rather than that it runs none —
the same checkability ADR-0049 built, carried forward to a codebase that ships a script.

**Expensive**, and inherited directly from ADR-0049's own cost: any script that is not the SPA's
own bundle — an accidental analytics snippet, a debugging tag pasted into a template, a CDN import
added in a hurry — stops rendering rather than shipping quietly. The SPA's dependencies (React,
TanStack, shadcn/ui's generated components) must all resolve into the self-hosted bundle; none may
be loaded from a CDN at runtime, and `font-src 'self'` extends the same rule to the self-hosted
interface font.
