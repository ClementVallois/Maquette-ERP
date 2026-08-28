# ADR-0049 — The application declares its own Content-Security-Policy, and it says there is no script

- **Date**: 2026-08-21
- **Status**: superseded by ADR-0064

## Context

BUILD-PLAN 8.3 puts security headers on the nginx vhost, alongside the rate limit and the TLS
configuration. That is the conventional place for them and it is where they will also be, but it
leaves this phase with a gap that is easy to miss: **between now and Phase 8, the screens are
served with no policy at all** — in development, in the tests, and in every run of the CI job that
exercises them.

The gap matters more here than it usually would, because two decisions this repository has already
taken are exactly the kind a CSP can express. ADR-0009 decided there is no client framework and no
script. ADR-0025 decided nothing may be interpolated into a `<script>` body, and refuses at render
time when someone tries. Both are claims about the code, and both are currently believed rather
than checked by anything outside this repository's own test suite.

## Decision

**The application sets its own security headers, on every response, from one hook — and the
Content-Security-Policy is the strictest one available: `default-src 'none'` with two allowances.**

```
default-src 'none'; style-src 'self'; img-src 'self';
form-action 'self'; base-uri 'none'; frame-ancestors 'none'
```

The point is not defence in depth against a compromised proxy. It is that **this policy is a
statement about the code rather than about the deployment**. `script-src` falls to `default-src
'none'`, which is ADR-0009's "no client framework" and ADR-0025's RAWTEXT refusal restated in a
form a browser enforces and `curl -I` reports. A policy that lived only in nginx would be absent
in development, absent in the tests, and true by accident.

`form-action 'self'` is the clause that earns its place in a mockup where every write is a form
post: an injected `<form action="https://…">` cannot exfiltrate a submission even if the escaping
of ADR-0025 were defeated. `base-uri 'none'` closes the matching trick with `<base href>`.

The three companions — `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
`X-Frame-Options: DENY` — go in the same hook. `no-referrer` is not boilerplate here: a Cra URL
carries a consultant identifier and a period, and a referrer is the ordinary way an internal
identifier reaches a third party's log.

**The headers are applied to every response, including `/api/v1` JSON.** A CSP on a JSON body does
nothing and costs nothing; a header list with an exception in it is a header list somebody has to
remember, which is the failure mode this repository is arranged against everywhere else.

## Rejected option

**Headers at the reverse proxy only, as BUILD-PLAN 8.3 schedules them.** The conventional answer,
and it has a real argument: the proxy is one place, it covers static errors the application never
sees, and it survives the application being replaced. It loses on the three counts above — absent
in development, absent in the tests, and unrelated to the code it describes — and on a fourth that
is specific to this repository: the CSP is a **demonstrable artefact** of two ADRs, and an artefact
that only exists on a host nobody can inspect proves nothing to the reader this repository is
written for. Nothing stops nginx from setting them too; Phase 8 will, and where both set a header
the proxy's is the one that survives, which is the right precedence.

**A permissive policy with `script-src 'self'`, leaving room for a script later.** Rejected as the
inverse of how a threshold works. Reserving room for a decision not taken is how `'unsafe-inline'`
ends up in a policy eighteen months later with nobody able to say which page needed it. If a screen
ever needs a script, that is ADR-0009's reconsideration threshold and this header changes in the
same commit as the script — visibly, in a diff, with a reason.

## Consequences

**Easy.** `curl -I https://erp.clementvallois.fr/` is a one-line demonstration that the application
runs no script, which is otherwise an assertion. The policy also makes an entire class of mistake
loud rather than silent: an inline `<style>` attribute or a CDN font added in a hurry stops
rendering rather than shipping.

**Expensive**, and this is real: `style-src 'self'` forbids inline `style` attributes, so every
piece of presentation has to reach the stylesheet. That is a discipline the phase now inherits, and
it is the same one ADR-0025 already imposes by refusing to interpolate into a `style` attribute at
all — so the cost was already paid, and this makes it enforced rather than remembered.

Second cost: no third-party asset can be added without editing this policy. Deliberate. In a
repository whose CI runs a dependency scan and a secret scan, a font loaded from a CDN would be the
one unaudited byte in the page.

## Reconsideration threshold

Reopen when a screen genuinely needs script — ADR-0009's own threshold, roughly ten screens or the
first live-entry grid. The change then is a `script-src 'self'` and a file, never `'unsafe-inline'`
and never a hash list maintained by hand.

Reopen the **"application sets them" half** if the policy ever has to differ per environment — a
staging instance embedding the app in an internal portal would need `frame-ancestors`, and a
per-environment header belongs in configuration or at the proxy, not compiled into the code.
