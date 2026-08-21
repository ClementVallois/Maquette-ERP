# `scripts/__boundary-fixture__`

Deliberate violations, kept alive so the rule that governs `scripts/` has a negative test.

`scripts/` is a composition root that carries no manifest: `seed.ts` drives both modules'
aggregates and imports `apps/api` for the deterministic id factory (ADR-0041). It therefore gets
exactly an app's grant — a module's public entry point, and nothing behind it.

Until Phase 5's closure the boundary globs did not reach this directory at all, so a deep import
written in a script would have cruised clean. These two files are what proves the grant is a grant
and not a blanket permission: one takes the arrow it is allowed, the other reaches past the index
and must be refused.

The directory is excluded from the shipped cruise by `options.exclude` in
`.dependency-cruiser.cjs`, and included by `.dependency-cruiser.fixture.cjs`, which is what
`tests/boundary-rule.test.ts` runs.
