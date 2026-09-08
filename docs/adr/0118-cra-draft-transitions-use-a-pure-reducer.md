# ADR-0118 — CRA draft transitions use a pure reducer

- **Date**: 2026-09-07
- **Status**: accepted

## Context

The CRA grid renders the same draft through desktop and mobile views. Its matrix, dirty flag, and
single-level undo history were held in three independent React state cells and updated together by
each editing callback. That made a transition easy to change incompletely and left persistence
coordination mixed with quantity transformations in a 1,200-line screen. Quantity rules themselves
already live in the tested pure `matrix.ts` module.

## Decision

Represent the client-side CRA draft as one state value managed by a pure reducer. The reducer
coordinates matrix, dirty, and undo transitions by calling the existing matrix functions. A
`useCraDraft` coordinator wraps that reducer with server synchronization, persistence, remote-update
conflicts, and navigation blocking. Desktop and mobile controls dispatch into the same reducer.

## Rejected option

A single hook combining draft transformations, persistence, and navigation was rejected because it
would hide the independently testable transitions behind a rendering harness. Persistence
coordination is extracted separately around the reducer. Splitting every local visual component into
its own file was also rejected because file count does not reduce state coupling and the existing local
sections do not all have independent behavior.

## Reconsideration threshold

Combine reducer and persistence coordination only if their separate interfaces cause two independent
ordering regressions that cannot be expressed through reducer or coordinator tests. Extract a local
view section only when it gains independent state, reuse, or a separately testable responsibility.

## Consequences

Edit, fill, clear, add, remove, replace, save, and undo transitions are testable without rendering
React. The coordinator owns the ordering-sensitive remote state while the screen translates UI
actions into reducer actions, so retained browser tests remain the proof of both wiring boundaries.
