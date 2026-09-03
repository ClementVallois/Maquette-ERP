# ADR-0028 — The mockup is hosted, so deployment controls are part of this repository

- **Date**: 2026-09-03
- **Status**: accepted

## Context

The original triage deferred continuous delivery, artifact signing, runtime hardening and hosting
to the target ERP. That was coherent while this repository produced no running service outside a
developer machine. `docs/BUILD-PLAN.md` has since made a public instance at
`https://erp.clementvallois.fr` part of the mockup: the premise changed, so leaving those controls
deferred would make the repository stop exactly where its supply-chain and authorization claims
become exposed to the internet.

The target is a personal VPS which already hosts services and data unrelated to this project. The
deployment therefore has two distinct obligations. It must make the demonstrator reachable, and it
must keep compromise of the repository or its CI from becoming an inbound path to the host. A
deployment that meets only the first obligation is worse than no hosted instance.

This is a changed decision, not a correction to an old description. Under ADR-0045 the old
premise remains part of the record and this ADR supersedes it.

## Decision

**The mockup is hosted at `https://erp.clementvallois.fr`, and the controls needed to build,
publish and run that deployment are in scope for this repository.**

The four previously deferred subjects are replaced as follows:

- **Build and deploy stay separate.** GitHub Actions builds and publishes one OCI image after a
  merge to `main`; the host independently decides when to pull and run it. A green build is not
  authority to enter the VPS.
- **CI holds no host credential.** Publishing may use GitHub's repository-scoped, ephemeral
  `GITHUB_TOKEN`; no SSH key, VPS token, production database password or runtime secret enters the
  repository or an Actions secret. ADR-0029 fixes the pull protocol.
- **Artifact provenance is produced.** The workflow publishes the image by immutable digest and
  emits GitHub's build-provenance attestation without introducing a long-lived signing key.
- **Runtime hardening is part of the deliverable.** Container, network, reverse-proxy, Unix-user
  and secret-file controls are versioned here; ADR-0030 fixes their isolation boundary. This is
  hardening for a public demonstrator on one named host, not a claim of production certification
  or sovereign hosting.

The repository delivers reproducible host configuration and guided operator steps. It does not
silently mutate DNS, certificate state, users, sudoers or `/etc` from CI; those remain explicit
human operations because they cross from the repository into a host carrying unrelated data.

## Rejected option

**Keep deployment outside the repository and host the process by hand.** That would be faster for
the first release and would avoid maintaining deployment files. It loses because it makes the
public instance unverifiable: the image a reader audits would not be demonstrably the image the
host runs, rollback would live in shell history, and runtime isolation would be an operator memory
rather than part of the deliverable. It would also preserve “no CD” only by renaming an
undocumented deployment as manual operations.

**Do not host the mockup; publish only the repository.** This remains the safe fallback if the host
cannot be isolated, but it no longer satisfies the intended demonstration. The screens, persona
scopes and complete Cra-to-invoice chain are more legible as a running, synthetic-data instance
than as setup instructions alone.

## Reconsideration threshold

Reopen the hosting decision at the first real user, the first item of non-synthetic data, or the
first availability or recovery commitment. Any one of those changes a resettable demonstrator into
a service and requires production authentication, data classification, retention, monitored
backups and an accountable operating model.

Reopen the chosen host if isolation from its unrelated services cannot be established by the
controls in ADR-0030, or if a target-ERP requirement demands a certified or sovereign hosting
provider. In either case the fallback is to withdraw the public instance, not to relax isolation.

## Consequences

Deployment code, image publication, provenance and runtime configuration are now reviewed and
tested with the application. The public URL can be tied to a commit and image digest, while the VPS
keeps the final deployment authority.

The repository acquires an operations surface that must remain truthful: a stale pull script or an
untested rollback path is now a product defect. Hosting also exposes the deliberately weak persona
selector to the internet, so the instance may contain synthetic seed data only and must be treated
as disposable; ADR-0032 decides that lifecycle before the host-side implementation is written.
