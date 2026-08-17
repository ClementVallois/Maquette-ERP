# ADR-0009 — Server-rendered HTML, with no client framework

- **Date**: 2026-08-17
- **Status**: accepted

## Context

`CLAUDE.md` makes empty states, error states and permission-denied states **deliverables**: they are
the proof that the authorization model exists, not polish. So the mockup has to render something —
an API alone cannot show a manager being refused the margin of another office's mission.

It also has four days of build time and, at the time of this decision, two enum files of domain code.
Whatever renders has to be cheap enough that it does not eat the invariants it is meant to display.

## Decision

**Pages rendered by the server**, from plain template functions, plus one hand-written CSS file. A
versioned `/api/v1` returns JSON for the same use cases. No client framework, no bundler, no front
build step, no npm dependency for the view layer.

Four screens: the Cra grid, the pré-facturier, the invoice, and the refusal page.

## Rejected option

**A fullstack framework (Next.js App Router).** The fastest route to screens, and the one the source
material leaned toward. It loses on the thing this repository is about: it blurs the server/client
boundary. Deciding what runs where becomes a per-file convention (`'use client'`), which is exactly
the class of boundary that ADR-0001 argues is worthless unless a machine checks it. Adding a second,
softer, unverified boundary next to the one being demonstrated undercuts the demonstration. It also
brings a build step, a large dependency tree (against the supply-chain posture), and a framework
opinion about data fetching that would reach into the modules.

**An API only, with no UI at all.** Honest, and cheapest. It loses because three named deliverables
in `CLAUDE.md` are _states a user sees_, and because a "maquette" that cannot be opened in a browser
is a library. The refusal is the demonstration; it has to be visible.

**React or Vue as a client on top of the API.** Neither amortises over four screens: both cost a
build step and a dependency tree to produce markup that a template function produces directly. Vue
is the author's faster option of the two and would have won if a client framework were needed at all.

## Consequences

No component library means the states are written by hand, which is fine at four screens and would
not be at forty — that is the threshold below. It also means nothing in this repository demonstrates
front-end framework competence, deliberately.

The RFC 9457 error shape already in `packages/contracts` carries the refusal reason, so the API and
the rendered page display the same typed motive rather than two separate error vocabularies.

## Reconsideration threshold

Reopen at roughly ten screens, or at the first genuinely interactive one — a Cra grid with
client-side series entry, a live staffing plan — where re-rendering the page per keystroke stops being
acceptable. At that point the honest choice is Vue on top of the existing API, not a rewrite.
