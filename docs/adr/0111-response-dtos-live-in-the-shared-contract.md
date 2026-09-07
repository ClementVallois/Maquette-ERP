# ADR-0111 — Response DTOs live in the shared contract, as explicit interfaces

- **Date**: 2026-09-07
- **Status**: accepted

## Context

Package 09 of the audit (`docs/clean-up-audit.consolidated.local.md`), second sub-step:
"`packages/contracts/src/index.ts` exports problem types only. Feature `types.ts` files manually
duplicate server response shapes; `apiFetch<T>` casts parsed JSON to caller-supplied `T`. The route
file's claim that clients are typechecked against the same response types is false."

The literal claim the audit's evidence names could not be found verbatim in the current tree — it
most likely described an earlier revision, or a planning document (`docs/frontend-plan.md`'s
Appendix A, "Pinned API contract" — a table of prose, not a type) that has since moved or been
superseded by other work on this branch. What is checkable directly, and was true: every route
handler in `apps/api/src/routes/*.ts` returned a plain object literal with no declared return
type, and every feature under `apps/web/src/features/*/types.ts` declared its own `interface` for
the same shape by hand. Nothing connected the two — `apiFetch<T>` (`apps/web/src/lib/api-client.ts`)
takes `T` from the caller and never checks it against anything the server actually promises.
Renaming a field on one side is a runtime bug discovered by a component reading `undefined`, not a
type error caught at the boundary.

Verified mechanically for the first resource moved (`session`): removing `PersonaSummary.office`
from the shared contract made `pnpm --filter @erp/api run typecheck` fail inside
`apps/api/src/routes/session.ts` (`view()`'s object literal) **and** `pnpm --filter @erp/web run
typecheck` fail inside three SPA call sites (`persona-block.tsx`, `routes/index.tsx`) — the two
independent failures the pre-fix code could never produce, since neither side's type referenced
the other's.

## Decision

**Move each resource's response shapes into `packages/contracts/src/<resource>.ts`, as plain
`interface` declarations — not Zod-inferred types.** `session.ts` is the first (this ADR); the
remaining resources named by the audit (`cra`, `invoices`/`factures`, `dashboard`, `pre-facturier`,
`affectations`/staffing, `marge`/economics) move the same way, one resource per commit, each
verified the same way session was: delete/rename a field, confirm both `apps/api` and `apps/web`
fail to typecheck, restore it.

On the server side, every route handler's success-path return value is now typed against the
matching interface — either as the handler's own return-type annotation, or as an explicitly typed
local (`const responseBody: SelectPersonaResponse = { ... }`) immediately before `.send()`, when
the handler's actual return value is the Fastify reply object rather than the JSON literal itself.
A mapper function that turns a domain/row shape into wire shape (`session.ts`'s `view()`) is typed
to return the contract interface directly, which is what makes the "Done when" clause's field
rename fail exactly where the mapper stops matching the promise, not somewhere downstream.

On the client side, each feature's own `features/<resource>/types.ts` re-exports the same types
from `@erp/contracts` rather than restating them. The file stays — every other module in the
feature keeps importing `./types`, so this is a one-line change per file, not a repository-wide
import rewrite — but its content is now one `export type { ... } from '@erp/contracts'` line, not
a second, independently-maintained description.

`packages/contracts` gains a real dependency on `@erp/platform` (`Role`, and whatever other shared
primitive a later resource needs — `IsoDate` is the likely next one, for a due date or a supply
period). `.dependency-cruiser.cjs`'s existing "shared kernel" whitelist entry (previously
`timesheet|billing` only) now also grants `contracts`, matching the reasoning ADR-0110 already
recorded for why `platform` is not a "business dependency" in the sense
`contracts-has-no-business-dependency` forbids.

## Rejected option

**Zod schemas, with `z.infer` as the type, instead of plain interfaces.** This repository already
uses Zod at two boundaries where a value crosses from untrusted input into typed code: request
parsing (`apps/api/src/validation.ts`) and, as of this same package, `apiFetch`'s problem-details
validation (ADR-0110). A **response DTO** is neither: the server constructs it from data it already
controls, and the audit's own "Done when" clause for this sub-step is a compile-time property
("removing/renaming a server response field fails the relevant type/contract check"), not a
runtime one. Wrapping every response shape in a schema nobody parses against would be exactly the
"two independent descriptions" the audit warns against, moved from TypeScript-vs-TypeScript to
TypeScript-vs-Zod. `ProblemDetails` keeps its schema because it _is_ parsed, by the client, against
data that crossed the network without the server's cooperation; a resource's normal success
payload is not read that way anywhere in this codebase today.

**OpenAPI/schema generation from the route definitions.** The audit names this explicitly as
optional for a single-client application, not a prerequisite. Generating a spec from Fastify route
schemas would add a build step and a generated-file review burden for a guarantee two hand-written,
colocated interfaces already give directly.

**Leave `types.ts` as the single source of truth and have `packages/contracts` import from
`apps/web`.** Rejected on the dependency direction alone: `apps/web` already depends on
`@erp/contracts` (ADR-0016 and every use since), and `packages/contracts` is granted nothing under
`apps/` by the boundary whitelist — the reverse arrow does not exist to grant.

## Reconsideration threshold

If a resource's response shape ever needs runtime validation on the client (the same reasoning
that put a schema on `ProblemDetails`) — e.g., a numeric field whose absence must be distinguished
from a zero, and a plain `?` cannot say which — add a schema for that one resource at that time,
rather than schema-ifying every DTO preemptively on the strength of one future case.

## Consequences

- Each resource move is its own commit, reviewable independently, matching the "Choose PR sizes by
  reviewability" instruction in the plan's own "Priorities and how to execute" section.
- `packages/contracts/package.json` depends on `@erp/platform` now, in addition to `zod`
  (ADR-0110): the package described as "types and constants only" a few hours earlier in this same
  branch is now "types, constants, how to check the untrusted ones, and the shared primitives the
  typed ones are built from."
- A future resource that needs a shared primitive `@erp/platform` does not yet export publicly
  (today it exports `Actor`, `isRole`, `ROLES`, `Role` — see `packages/platform/src/index.ts`) adds
  it to that public surface rather than reaching past it; the boundary rule this ADR extends grants
  only `packages/platform/src/index.ts`, not the package's internals.
