# ADR-0030 — The deployment is isolated from the rest of the host

- **Date**: 2026-09-03
- **Status**: accepted

## Context

The VPS selected by ADR-0028 is not dedicated to this demonstrator. It runs other services and
holds personal data unrelated to the repository. ADR-0029 removes an inbound CI credential, but a
pull-based deployment is not sufficient isolation by itself: a deploy operator with Docker group
membership is effectively root, a published Postgres port exposes a new host service, and a
default root container turns an application escape into unnecessary privilege.

The existing host terminates TLS in system nginx. Neighbouring containers publish application and
database ports on loopback. Reusing every neighbouring convention would be convenient, but the ERP
database has no consumer outside its compose project and therefore has no reason to exist on the
host network at all.

## Decision

**The ERP deployment gets a dedicated, least-privilege operating boundary; no deployment identity,
container or network receives access merely because another service on the host already has it.**

The boundary consists of the following controls, each tied to the capability it removes:

- **Operator identity.** A dedicated `erp-deploy` Unix user owns no application file, is not in the
  `docker` group and cannot edit the root-owned deployment scripts, compose file, systemd units or
  secrets. Its sudoers rule names only the ERP deployment, rollback and reset units. This prevents
  access to the deployment account from becoming general Docker or root access.
- **Privileged orchestration.** The root-owned systemd oneshot units perform the Docker operations
  because access to the rootful Docker daemon is privileged. The timer invokes those same units;
  there is no parallel cron or interactive shell path. `erp-deploy` may ask systemd to start or
  inspect only those units, and cannot substitute a command or environment value.
- **Filesystem boundary.** Versioned deployment material is installed root-owned and non-writable
  by `erp-deploy`. Mutable digest state and locks live under `/var/lib/erp-deploy`; dumps live under
  `/var/backups/erp-maquette`; both directories are root-owned and mode `0700`. Runtime secrets live
  in `/etc/erp-maquette/environment`, root-owned and mode `0600`, and enter only the systemd units
  that require them.
- **Database network.** Compose creates a project-private network. Postgres has no `ports` entry at
  all—not even loopback—and is reachable only by the application and one-shot migration/reset or
  backup containers on that network. This removes the database from the host attack surface.
- **Application ingress.** Only the application port is published, bound to `127.0.0.1`; system
  nginx is its sole public caller. A dedicated `erp.clementvallois.fr` vhost terminates TLS, applies
  a request-rate limit and response security headers, and proxies no other path or upstream.
- **Container privilege.** The application image declares a numeric non-root user. Compose keeps
  the root filesystem read-only, mounts a bounded `tmpfs` for `/tmp`, sets
  `security_opt: no-new-privileges:true` and drops all Linux capabilities. No host path, Docker
  socket or privileged device is mounted. Postgres uses its vendor non-root process and a named
  data volume, with no host bind mount.
- **Credential split.** The long-running application receives only the least-privilege
  `DATABASE_URL` plus its runtime configuration. The schema-owner URL exists only in the one-shot
  migration and reset units. The GHCR read token exists only where image resolution and pull need
  it. Neither credential is present in the application image or CI.

These controls contain this deployment relative to the rest of the VPS. They are not a claim that
the shared kernel and Docker daemon provide the isolation of a separate machine, and they do not
turn the persona selector into production authentication.

## Rejected option

**Put `erp-deploy` in the `docker` group and let the pull script run Compose directly.** This is the
common operational shape and avoids root-owned oneshot units. It loses because Docker group members
can mount the host filesystem or start a privileged container and are therefore root-equivalent.
The narrow sudoers rule would be theatre if the same account already held a broader route.

**Publish Postgres on `127.0.0.1`, matching neighbouring compose projects.** Loopback is smaller
than a public bind, but every process and compromised service on the host could still attempt the
database. The ERP app, migrator and dump job already share a Docker network, so a host port buys no
required connectivity.

**Use rootless Docker or Podman for the whole project.** This offers a stronger daemon boundary and
is the serious longer-term alternative. It loses here because the host already operates rootful
Docker, the repository's setup and CI exercise Docker Compose, and introducing a second container
runtime plus user-level systemd would add an untested operational stack to protect a synthetic-data
demo. The decision keeps rootful orchestration narrow rather than pretending it is unprivileged.

## Reconsideration threshold

Move the deployment to a dedicated host or stronger virtual-machine boundary at the first real or
personal datum, the first user account, or the first demonstrated need for the ERP process to mount
a host path or talk to another host service. Each breaks the assumption that compose-network and
Unix-account isolation are proportionate to the data.

Reopen rootless containers if the host standardises on them for another maintained service, or if
the Docker daemon or its root-owned systemd units appear in an incident or audit finding. That
would supply the operating experience this repository currently lacks and make a second runtime a
smaller cost than continued daemon privilege.

## Consequences

A compromise of the web process reaches synthetic ERP data and its own private network, not a
published database port, Docker socket or writable host directory. A compromised deployment
account can request a small set of root-owned operations but cannot turn arbitrary compose input
into a root container.

Installation is more deliberate: root-owned paths, sudoers, systemd units and nginx configuration
must be installed together and permissions verified. The human setup guide owns those checks. A
single VPS and rootful Docker remain a shared failure domain, which is accepted only while the
instance is a resettable demonstrator with synthetic data.
