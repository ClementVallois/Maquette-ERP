# ADR-0084 — The image is a public package, so the host holds no registry credential

- **Date**: 2026-09-03
- **Status**: accepted

## Context

ADR-0029 decided that the host pulls the image rather than CI pushing it, so that no inbound
credential into this box exists anywhere in GitHub. It left one sentence for the outbound
direction: the GHCR read credential "exists only where image resolution and pull need it".

Task 8.7 implemented that sentence as `docker login ghcr.io` run as root, because a private
repository publishes a private package and `buildx imagetools inspect` refuses without
authentication. The review pass of 03/09/2026 pointed out what that implementation actually does:
root's registry credentials live in `/root/.docker/config.json`, base64-encoded rather than
encrypted, and every rootful `docker` invocation on this host reads that file — including the
neighbouring services ADR-0030 exists to be isolated from. "Only where pull needs it" and "readable
by every container workload root starts on this box" are not the same place.

A second assumption sat underneath, and it was never verified: the wizard instructed a
fine-grained PAT "scoped to this repository only", and whether GitHub's Packages read permission
is genuinely repository-scoped rather than account-scoped was not confirmed from here.

## Decision

**The GHCR package is public. The host authenticates to nothing, and no registry credential exists
on it.**

A package's visibility on GHCR is set independently of its repository's, so this leaves the
repository private and changes only who may pull an image. `pull-and-redeploy.sh` resolves the
digest and pulls anonymously; the wizard has no credential stage; `/root/.docker/config.json` is
never written by anything in this repository.

What becomes public is exactly what the demonstrator already is: the application, its SPA bundle,
and the deterministic synthetic seed. No secret is baked into the image — every credential arrives
at runtime through the root-owned `EnvironmentFile` of ADR-0030 — and the image carries a
provenance attestation, so a puller can verify which workflow run and which commit produced it.

## Rejected option

**Keep the package private and write down where the token lives.** This was the honest version of
the status quo, and it loses on cost-benefit rather than on principle: the thing being protected is
a read-only pull of an image whose whole content is public-by-design demonstration code, and the
price of protecting it is a long-lived credential on a host that holds personal data unrelated to
this project. A credential that guards nothing valuable but widens a real blast radius is a bad
trade, and the trade does not improve by being documented.

**Give the pull its own `DOCKER_CONFIG` directory**, referenced only by the systemd units, so the
token stays out of root's shared config. This is the technically correct middle option and it was
rejected on the same ground: it adds a moving part, on the one path in this phase that no test
exercises, to protect the same worthless secret. Fewer parts beats better-isolated parts when the
best outcome is having no secret at all.

## Reconsideration threshold

Reopen the moment the image stops being publishable in the open: a real credential, a customer's
data, a proprietary dependency, or anything in the build context that is not this repository's own
synthetic material. At that point the isolated `DOCKER_CONFIG` above is the option to take, not the
root login this ADR removes.

## Consequences

The host's attack surface loses a credential entirely rather than relocating one, and ADR-0030's
"only where it is needed" holds as written instead of needing a narrower reading. The wizard drops
a stage, which is one fewer thing to get right on a path nothing tests.

The cost is stated rather than minimised: anyone may now pull and inspect the image. That is
acceptable because the same reader may already read this repository's entire reasoning — but it
means the image is now part of what is published, and anything added to it later is published too.
