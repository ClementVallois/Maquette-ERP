# ADR-0015 — The application shell lives in `apps/`, not in `packages/`

- **Date**: 2026-08-17
- **Status**: accepted

## Context

`pnpm-workspace.yaml` globbed `packages/*` and nothing else, while two files that gate the build
already named a tier that did not exist: `vitest.config.ts` collects `apps/**/*.int.test.ts` for the
integration project, and `.dependency-cruiser.cjs` forbids `platform` from reaching into `apps/`.
Both were written in anticipation of Phases 5 and 6, which add a Fastify server (ADR-0008) and
server-rendered screens (ADR-0009). Until the tier is declared, those two references are inert: an
integration test placed under `apps/` would simply not run, and the rule protecting `platform` would
protect it from a path nothing can match.

The question is not whether the deployable exists — it will. It is whether it is **a module among
the modules** or **a tier of its own**, because that choice decides which arrows are legal, and the
arrows are what this repository claims to enforce.

## Decision

**`apps/` is a second workspace tier, above `packages/`, governed by two rules:**

- an app may import a module through its **public entry point** (`packages/<name>/src/index.ts`) and
  nothing behind it;
- **no module may import an app** — the named rule `no-module-to-app`.

Declared now, populated in Phase 5. Both rules are carried by fixtures from the moment they are
written (see Consequences).

## Rejected option

**`packages/web` and `packages/api` — the deployable as one more package.** It is the cheaper move:
one glob, no new tier, and pnpm treats every workspace member alike anyway.

It loses on the arrow it fails to forbid. Inside a single tier, `timesheet → web` and
`web → timesheet` are the same kind of edge, and the only thing standing between them is a rule
someone remembers to write. This repository's thesis is that the boundary is mechanical rather than
remembered (ADR-0001), so a layout whose central asymmetry — _composition flows one way_ — has to be
restated as a special case is the wrong layout. The tier makes the asymmetry structural: `^apps/`
and `^packages/` are two distinct path prefixes, and a rule between them is one line, not an
enumeration of module names that grows every time a module is added.

The secondary reason is the one that shows in a review: a reader who lists `packages/` should see
the domain, and only the domain. A `packages/web` in that list says the screens are a peer of
`billing`, which is exactly the confusion the two-module story exists to avoid.

**A third tier for shared UI or shared adapters** was considered and rejected as premature: there is
one app planned, and YAGNI is the stated sorting criterion. It is a directory move if it is ever
needed.

## Consequences

A rule that has never rejected anything is indistinguishable from a rule that does not work, and
this repository already refuses that ambiguity everywhere else — every boundary rule owns a fixture,
and commit `34a845f` removed the rules that matched nothing. Declaring `apps/` before any app exists
would have reintroduced exactly that defect, so the tier ships with its own fixtures:

- `apps/__boundary-fixture__/src/` — the granted arrow (module public index, **accepted**) and the
  refused one (module internals, rejected as `not-in-allowed`);
- `packages/timesheet/src/__boundary-fixture__/` — the reverse arrow, rejected as `no-module-to-app`.

`tests/boundary-rule.test.ts` asserts all three by rule name. Each was verified to fail for its own
reason: renaming `no-module-to-app`, deleting the whitelist entry, and widening it to
`^packages/` each break exactly one of the three cases and no other.

This is also the first **positive** fixture in the suite. It earns its place because the two negative
cases are both satisfied by a configuration that forbids `apps/` everything — a boundary that seals
the wrong thing and looks green doing it.

What this makes expensive: `scripts/boundaries.ts` now cruises two globs, and a future app has to be
imported by its own tests rather than by a module's, which is the point. What it makes easy: Phase 5
adds `apps/api` with no configuration change at all.

## Reconsideration threshold

Reopen if a second deployable needs to share non-domain code with the first (a rendering helper, a
server bootstrap). That shared code is not a module — it holds no invariant — so it would need
either a third tier or an `apps/`-internal package, and the choice between them is a new decision.
Reopen also if `apps/` ever needs an arrow into a module's internals: that would mean a module's
public entry point is not expressing its use case, which is a domain problem showing up as a
boundary complaint.
