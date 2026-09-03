# ADR-0029 — Deployment is pull-based, with no inbound host credential in CI

- **Date**: 2026-09-03
- **Status**: accepted

## Context

ADR-0028 puts the hosted mockup and its delivery controls inside this repository. The remaining
question is who is allowed to cross the boundary between GitHub and the VPS.

The usual small-project deployment gives an Actions runner an SSH private key and runs commands on
the host after a successful build. This host also carries personal services and data unrelated to
the ERP mockup. An SSH credential able to deploy this application is therefore an inbound
credential to a machine whose impact is much wider than this repository. Repository compromise, a
malicious action or an accidental log would turn CI into a route to that wider impact.

The deployment has no sub-minute release requirement. A short polling delay is invisible for a
demonstrator, so there is no operational reason for GitHub to initiate a host change.

## Decision

**GitHub Actions publishes an image; the VPS polls GHCR and deploys an immutable digest. GitHub
Actions never connects to the VPS and holds no credential accepted by it.**

On each merge to `main`, the image workflow:

1. builds the single multi-stage image declared by this repository;
2. publishes it to `ghcr.io/clementvallois/maquette-erp` with the moving `main` tag and an immutable
   commit-SHA tag;
3. captures the registry digest produced by the push; and
4. emits a GitHub build-provenance attestation for that digest.

The workflow uses only GitHub's ephemeral `GITHUB_TOKEN`, scoped to `contents: read`,
`packages: write` and `attestations: write` (plus `id-token: write`, which GitHub's attestation
action requires). It receives no SSH key, host address secret, production environment file,
database credential or long-lived signing key.

A systemd timer on the VPS periodically resolves the `main` tag. The host-side script compares the
remote digest with the digest recorded after the last successful deployment. If they differ, it
pulls and starts the application **by digest**, never by the mutable tag, and records both the new
current digest and the displaced digest as the rollback target. A failed readiness check restores
the displaced digest. Manual rollback uses that same recorded value; it is not a second path.

The GHCR read credential, while the package is private, exists on the host only. It grants package
read access and no repository or host privilege. Making the image public can remove that credential
later without changing the direction of deployment.

`--dry-run` resolves and reports the proposed transition but does not pull, migrate, restart,
write digest state or take a backup. CI exercises this mode with injected command substitutes; it
does not contact or impersonate the host.

## Rejected option

**Push over SSH from the Actions runner.** It is shorter, widely documented and gives immediate
deployment status on the commit. It loses because the credential is an inbound capability to a
host carrying unrelated data. Restricting an SSH key to one forced command narrows that capability
but does not remove it: the runner still initiates a privileged change on the host, and the forced
command becomes another security boundary to maintain.

**A webhook on the VPS.** This keeps the SSH key out of CI but still exposes an inbound deployment
surface, with a shared verification secret and request parser, solely to save a few minutes of
polling. The service would be a second application to patch and monitor and would have no business
value of its own.

## Reconsideration threshold

Reopen if deployments need sub-minute latency, or if a release approval must bind one named image
digest to one named human approval and the timer cannot express that gate. Either condition may
justify a controlled push or deployment service, but the new ADR must account explicitly for the
host's unrelated data; convenience alone is not the threshold.

Revisit the host-only GHCR credential as soon as the package becomes public. Public read access
should remove a secret that no longer protects anything, but it does not change pull-based
deployment or the immutable-digest rule.

## Consequences

A compromised CI runner can publish a bad image within the permissions of this repository, but it
cannot open a session on the VPS. Provenance, immutable digests and the host's recorded transition
make the artifact handoff inspectable and rollback deterministic.

Deployment is eventually consistent with `main`, not immediate. The host owns registry polling,
migrations, readiness, rollback and its local audit trail, so those mechanics must be shipped and
tested here. GitHub cannot truthfully show “deployed” merely because image publication succeeded;
the public readiness endpoint remains the evidence that the host accepted a release.
