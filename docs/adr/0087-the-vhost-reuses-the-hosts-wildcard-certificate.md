# ADR-0087 — The vhost reuses the host's wildcard certificate, and issues none of its own

- **Date**: 2026-09-03
- **Status**: accepted

## Context

Task 8.7 listed "the Let's Encrypt certificate" among the human steps, on a premise written into
`docs/BUILD-PLAN.md`: "`/etc/letsencrypt/live` currently holds only the apex domain". The wizard
therefore carried a certificate stage — an ACME webroot, a temporary HTTP-only stub vhost, and
`certbot certonly --webroot -d erp.clementvallois.fr` — and the real vhost referenced
`/etc/letsencrypt/live/erp.clementvallois.fr/`.

Reading the host before touching it, on 03/09/2026, showed the premise is false. The certificate at
`/etc/letsencrypt/live/clementvallois.fr/` is a **wildcard**: `DNS:*.clementvallois.fr,
DNS:clementvallois.fr`. It is renewed by the `dns-infomaniak` authenticator over DNS-01, with
`renew_hook = systemctl reload nginx`. Every neighbouring vhost on the box already points at it,
and one of them says why in a comment: _"Wildcard cert ONLY (a named cert would land the subdomain
in CT logs)."_

That is not a preference. Certificate Transparency logs are public and permanent, so issuing
`erp.clementvallois.fr` as its own certificate publishes the existence of that hostname to anyone
watching CT — which is precisely what the host's `catchall.conf` default server, its self-signed
certificate and its `444` on unknown hosts exist to prevent.

## Decision

**The vhost uses the host's existing wildcard certificate. This repository issues no certificate,
runs no ACME challenge, and installs nothing into certbot's configuration.**

`deploy/nginx/erp.clementvallois.fr.conf` points at
`/etc/letsencrypt/live/clementvallois.fr/{fullchain,privkey}.pem`. The ACME stub vhost is deleted
along with the wizard stage that installed it; the wizard now _verifies_ that a wildcard covering
this hostname exists and refuses to continue if it does not, rather than creating one.

The vhost also adopts the neighbours' TLS lines — `ssl_protocols TLSv1.2 TLSv1.3` rather than
certbot's `options-ssl-nginx.conf` and `ssl-dhparams.pem` includes — because six vhosts on this
host already state it that way and a seventh spelling of the same policy is a divergence nobody
asked for.

## Rejected option

**Issue a dedicated certificate for `erp.clementvallois.fr`, as the plan assumed.** It is the
ordinary answer and it is what the wizard was written to do. It loses three times over on this
specific host: it publishes the hostname in CT logs, against an explicit local decision; it adds a
second renewal configuration using HTTP-01 beside an existing DNS-01 one, so the box would have two
renewal mechanisms with different failure modes for one domain; and it touches production certbot
state on a machine carrying unrelated personal services, to obtain coverage that already exists.

**Keep the certbot stage but make it conditional.** Rejected as the worse kind of dead code: a
branch that only runs on a host nobody has, carrying an ACME stub vhost and a webroot that would
never be exercised or reviewed, in the one script whose whole purpose is that its steps are the
real ones.

## Reconsideration threshold

Reopen if the mockup ever moves to a host without a wildcard covering its hostname, or if the
wildcard's renewal stops being automatic — at which point the rejected option becomes correct and
the deleted stage should be restored from this ADR's history rather than reinvented.

## Consequences

The deployment gets shorter and touches less of the host: no webroot, no stub vhost, no second
renewal config, no ACME round trip on first install, and nothing this repository owns inside
`/etc/letsencrypt`. Renewal is entirely the host's existing concern, and the `renew_hook` that
already reloads nginx covers this vhost for free.

The cost is a dependency this repository does not control: if the wildcard lapses, this vhost fails
with it, and nothing here would warn first. The wizard's verification step is where that shows up,
and it names the expiry date it found so an operator sees a near-expiry certificate at install time.
