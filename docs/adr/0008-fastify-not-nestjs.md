# ADR-0008 — Fastify, not NestJS

- **Date**: 2026-08-17
- **Status**: accepted

## Context

The mockup needs an HTTP layer: a versioned API and a handful of server-rendered screens. The
repository's whole claim is that a module boundary is real because CI enforces it (ADR-0001), and
that the domain is plain TypeScript with no framework in it (`CLAUDE.md` rule 3).

The author's public profile advertises NestJS, so choosing against it is a decision that needs its
reasoning on the record rather than an omission to be explained later.

## Decision

**Fastify**, with routes composed by hand and dependencies passed as arguments.

## Rejected option

**NestJS.** It is the obvious pick: it speaks "module" natively, imposes a structure, and is the
stack named on the CV. It loses here for two specific reasons.

First, its modules give an **apparent** boundary. `@Module({ imports: [...] })` is a runtime wiring
declaration, not a compile-time or CI-time prohibition — nothing stops a file in `billing` from
importing a class out of `timesheet` and having it work. A reader who sees NestJS modules reasonably
concludes the boundary is the framework's, and the one thing this repository exists to demonstrate is
that the boundary is verified mechanically and independently. Fastify leaves the architecture
entirely to the code, which is an advantage precisely when the architecture is the deliverable.

Second, its dependency injection pulls the framework toward the domain. Decorators and injectable
providers are how NestJS wants aggregates and services to be constructed, and the rule here is that
the domain imports nothing external — not even a Node builtin. Keeping NestJS out of `domain/` while
using it everywhere else is possible, but it is a discipline, and this repository replaces
disciplines with mechanisms wherever it can.

**Express** was not seriously considered: Fastify does the same job with schema validation and typing
that fit better with Zod at the boundaries.

## Consequences

The trade-off is real and worth stating: nobody reading this repository sees NestJS competence
demonstrated. What they see instead is why it was declined, which is a different and defensible
thing — and the layering it would have provided (`domain` / `application` / `infrastructure`) exists
anyway, enforced by dependency-cruiser rather than by a framework convention.

## Reconsideration threshold

Reopen when there are more than two modules **and** the wiring between them becomes hard to follow by
reading `index.ts` files — that is the point where a DI container earns its cost. Also reopen if the
project stops being a demonstration of its own boundary, because the first reason above evaporates
with it.
