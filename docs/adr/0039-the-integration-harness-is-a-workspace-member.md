# ADR-0039 — The integration harness is a workspace member, not a directory

- **Date**: 2026-08-19
- **Status**: accepted

## Context

ADR-0019 put the integration harness — the pool, the per-test transaction rollback — in
`tests/harness/`, shared by both modules. It did not say what that directory _is_ to the packages
that consume it, and the answer defaulted to "a path": the integration tests reached it with
`../../../../tests/harness/rollback.ts`.

Every package sets `rootDir: "src"`. A relative climb out of `src` puts a file in the program that
`rootDir` says cannot be there, so `tsc -p tsconfig.json --noEmit` fails with **TS6059** in
`packages/timesheet` and `packages/billing`. This was recorded as an open question on 18/08/2026
and deferred to Phase 5, on the stated ground that it was "a latent error, not a CI failure"
because no CI job ran per-package typechecks.

**That ground was false, and false in the same branch that recorded it.** `pnpm run typecheck` is
`tsc -p tsconfig.json --noEmit && pnpm --recursive --parallel run typecheck` — the recursive half
_is_ the per-package typecheck — and Phase 3's own CI workflow runs `pnpm run typecheck` in the
`quality` job. The gate was red on the branch, not latent in it.

The deferral also hid a second, unrelated defect. `pg-invoice-repository.ts` used `ClientId`
without importing it; `tsc` reported it on the same run as the TS6059 lines, and a check nobody
could get to green is a check nobody reads.

## Decision

`tests/harness` becomes a **workspace member**, `@erp/test-harness`, declared in
`pnpm-workspace.yaml` and listed as a `devDependency` of the two modules that consume it. The
integration tests import `@erp/test-harness`, and `rootDir` holds everywhere.

This also brings the harness under a rule the rest of the repository already obeys: one `index.ts`
is the only public surface. The deep imports of `db.ts` and `rollback.ts` are gone with the
relative climb that made them possible.

The harness keeps the property `pg-event-store.ts` documents — **no workspace dependency**. It
depends on `pg` and `vitest` and on nothing under `packages/`, so the arrow points from the modules
to the harness and never back.

## Rejected option

**Widening the type-check surface instead of naming the dependency** — dropping `rootDir` from the
package configs, or moving the integration tests into the root `tsconfig.json`'s `include`. Both
silence TS6059 and neither says what the harness is. `rootDir` is what makes "a package's sources
live in its `src`" checkable rather than conventional, and the root config is scoped to repository
tooling on purpose; feeding it two modules' test files makes it the config that type-checks
everything, which is the config that stops meaning anything. Above all, neither removes the
`../../../../` climb: the packages would still reach across the repository by path, which is the
form of coupling this repository exists to refuse.

The second rejected option was the one actually in force until now: **leaving it open and fixing it
in Phase 5**. It fails on its own premise, which the paragraph above documents.

## Reconsideration threshold

A second harness, or the first consumer outside `packages/*` — when Phase 5 creates `apps/api` and
`PgEventStore` is promoted out of `tests/harness`, what remains here is re-examined: if the pool and
the rollback are all that is left, a workspace member for two files is worth questioning again.

## Consequences

**Easy**: per-package `tsc --noEmit` passes, so the `quality` CI job actually checks the packages
rather than failing before it reaches them. The harness has a public surface, and `import-x`
judges each integration test against its own package's manifest — an undeclared harness import now
fails lint as well as types.

**Expensive**: one more workspace member, one more `package.json`, and a `pnpm install` needed by
anyone who pulls this change before running the tests. The harness's own files are type-checked by
the root `tsconfig.json` rather than by a config of their own.
