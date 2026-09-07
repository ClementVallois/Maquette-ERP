# ADR-0110 — Problem details are validated at the client boundary, with a named rule against contracts importing a module

- **Date**: 2026-09-07
- **Status**: accepted

## Context

Package 09 of the audit (`docs/clean-up-audit.consolidated.local.md`), first sub-step: "at
minimum validate problem details before treating arbitrary proxy JSON as a known error."

`apps/web/src/lib/api-client.ts`'s `apiFetch` already refused to trust a non-2xx response whose
`Content-Type` was not `application/problem+json`, and already caught a body that failed to parse
as JSON at all — both correctly routed to `CLIENT_PROBLEM_TYPES.unparsableResponse`. What it did
not do: check that a body which _did_ parse as JSON, behind the right header, had the _shape_ of a
`ProblemDetails`. `await parseJson<ProblemDetails>(response)` is an unchecked cast — `parseJson`'s
own header names it as the one place `T` gets asserted rather than proved. A response answering
`{ type: 42, oops: true }` with the right content type passed straight through, and every caller
that branches on `problem.type` (`ApiProblemError`, `lib/labels.ts`'s French sentence lookup,
every feature's error UI) would have received a number where it expected the one field the whole
mechanism exists to read.

Reproduced without a cast: a fail-first test in `apps/web/src/lib/api-client.test.ts` sent exactly
that body and asserted the pre-fix code returned it verbatim (`result.problem.type === 42`);
confirmed failing before the fix, passing after.

## Decision

**Validate at the boundary with the schema this repository already uses for the same purpose.**
`packages/contracts/src/problem-details.ts` gains `problemDetailsSchema`, a Zod object schema
placed directly next to the `ProblemDetails` interface it mirrors — the same "Zod at the boundary
only" doctrine `apps/api/src/validation.ts`'s own header states for the server side, applied here
to the client's own boundary: a shape from `fetch()` is not yet proven to be anything. `apiFetch`
runs every already-JSON-parsed error body through `problemDetailsSchema.safeParse` before trusting
it; a shape that fails validation is treated exactly like an unparsable body
(`CLIENT_PROBLEM_TYPES.unparsableResponse`), not surfaced as a differently-broken third case — the
caller already has one designed-for "the transport lied" branch, and a second one would be a
distinction with no consumer.

`@erp/contracts` gained `zod` as a real dependency (it had none before) rather than reaching for
`apps/web`'s own copy: the schema is shared contract, and a package that validates its own wire
shape should not depend on which app happens to import it first.

**A second, smaller decision in the same package:** `packages/contracts` had no rule of its own
forbidding it from importing `packages/timesheet` or `packages/billing` — the closed whitelist in
`.dependency-cruiser.cjs` already made such an import fail (nothing grants that arrow), but
silently, the same way an undeclared arrow anywhere else fails. `contracts-has-no-business-
dependency` names it explicitly, the same way `billing-not-to-timesheet` names the arrow between
the two business modules — so a violation report reads as "the shared contract reached into a
module" rather than "not in allowed", and the fixture at
`packages/contracts/src/__boundary-fixture__/forbidden-import.ts` proves the rule is alive rather
than merely implied, the same way `packages/billing/src/__boundary-fixture__/` already does for
its own rule.

## Rejected option

**Leave problem-details validation to TypeScript alone.** The type already exists; the gap is
that a compile-time type says nothing about a value that crossed the network. Every other boundary
in this codebase that receives untrusted shape (`apps/api/src/validation.ts`'s own request
parsing) validates at runtime with the same library — treating the client's own inbound boundary
differently would be an inconsistency with no reason behind it.

**A hand-written shape check (a few `typeof` tests) instead of Zod.** Zod is already a dependency
of both apps and the established pattern for exactly this kind of boundary check; a second,
bespoke validator for one more shape would be "two independent descriptions" of the same kind of
problem the package's own "Done when" clause warns against, just for validators instead of DTOs.

**Rely on the closed whitelist alone for the contracts boundary, add no named rule.** True today —
the whitelist already refuses the arrow — but every other module-to-module boundary in this
repository that matters gets a name (`billing-not-to-timesheet`, `timesheet-not-to-billing`,
`no-module-to-app`), specifically so a violation reads as a decision rather than an omission. A
package born with zero rules of its own is one violation away from someone believing the arrow was
simply never considered.

## Reconsideration threshold

If a route ever needs to return an error shape `ProblemDetails` cannot represent (a genuinely
different envelope, not an extension field), revisit whether `problemDetailsSchema` should become
a union rather than growing another optional field indefinitely.

## Consequences

- `apps/web/src/lib/api-client.ts`'s error path now does one extra `safeParse` per non-2xx
  response — negligible, and it is the one place in the whole SPA a shape from the network becomes
  a value every feature trusts.
- `packages/contracts/package.json` now declares a real dependency for the first time; the package
  is no longer "types and constants only" but "types, constants, and how to check them," which is
  what a shared wire contract that includes runtime problem-details validation should be.
- The `exactOptionalPropertyTypes` gap between Zod's inferred optional-field type (`T | undefined`)
  and this repository's own `ProblemDetails` interface (`T`, present or absent) needed one isolated
  cast at the return site — documented in place, the same way `parseJson`'s own comment marks the
  one assertion in that file.
