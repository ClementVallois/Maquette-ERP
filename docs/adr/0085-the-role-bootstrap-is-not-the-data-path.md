# ADR-0085 — ADR-0030's "no host bind mount" governs the data path, not the role bootstrap

- **Date**: 2026-09-03
- **Status**: accepted

## Context

ADR-0030's container-privilege section reads: "Postgres uses its vendor non-root process and a
named data volume, with no host bind mount." `deploy/compose.prod.yml` then bind-mounts
`../docker/postgres/init` read-only into `/docker-entrypoint-initdb.d`, exactly as the development
`compose.yml` has since Phase 3, so that `01-roles.sh` creates the schema-owner and least-privilege
roles the two-role split depends on.

The Phase 8 checkpoint noticed the tension, decided the ADR's sentence was about the data path, and
wrote five lines of reasoning into the compose file's header comment. The rules audit of
03/09/2026 rejected that resolution on two counts, and both are right: this repository's comment
rule sends "why we chose this" to an ADR, and ADR-0045's test for whether a decision moved is met —
reading a sentence more narrowly than it is written changes what the ADR permits, which is a
decision, not a clarification.

## Decision

**ADR-0030's prohibition governs `PGDATA`. A root-owned, read-only bind mount of the role bootstrap
script is permitted, and is the only one.**

The prohibition exists because a host directory holding the database's data files puts the
database's state on a filesystem shared with the rest of a box that carries unrelated personal
data. `01-roles.sh` is the opposite case in every respect that motivated the rule: it is read-only
to the container, it is owned by root on the host, it is forty lines of SQL under version control
in this repository, it is read exactly once at first initialisation, and it holds no state at all.

The alternative reading — bake it into a derived Postgres image — was rejected below, so this ADR
also settles that the _same_ file serves local development and the host. One source for the
two-role split is the property being protected here; that split is the invariant Phase 3 exists to
enforce, and a second copy of the script is a second thing that can drift from it.

## Rejected option

**Build a small derived Postgres image with the script baked in, and drop the mount.** It satisfies
ADR-0030's sentence literally and removes the question. It loses on the thing the mount is there to
protect: it duplicates the role bootstrap, so local development and the host would each have their
own copy of the file that decides which role owns the schema — precisely the drift the single
source prevents. It also adds a second image to build, publish, digest-pin and keep current with
upstream Postgres, for a forty-line script.

**Leave it in the file comment.** The code is safe either way, so this was tempting and it is the
one this ADR overturns. It loses because a decision that lives only where the code lives is
invisible to the reader who checks the ADRs against the diff — which is exactly the reader who
found it.

## Reconsideration threshold

Reopen at any second bind mount into a database container, at any mount that is not read-only, or
the first time this one carries something other than idempotent DDL. Any of those means the mount
has stopped being a bootstrap and started being an interface, and the derived image above becomes
the right answer.

## Consequences

The compose file's header comment loses its argument and keeps only the mechanical facts, with a
link here. ADR-0030 keeps its sentence unedited — its number, date, status and threshold are never
rewritten — and this ADR is where the narrowing is recorded, which is where a reader auditing the
deployment against its decisions will look.
