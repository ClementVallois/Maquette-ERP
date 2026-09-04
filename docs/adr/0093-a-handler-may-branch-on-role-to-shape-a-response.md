# ADR-0093 — A handler may branch on role to shape a response, never to authorize

- **Date**: 2026-09-04
- **Status**: accepted

## Context

`docs/BUILD-RULES.md` § Authorization ends its three-loci sentence with a flat prohibition: "One
decision each, and **no handler compares a role**." The three loci are the route (which declares
the roles that carry the action, as data), the repository (which decides which records this actor
may see), and the domain (which decides whether an actor may act given who acted before them).

`GET /api/v1/org-chart` compares a role in its handler:

```ts
if (actor.role === 'consultant') return { role: 'consultant' as const, manager };
```

Nothing about that comparison authorizes anything. The route already declared
`forRoles('consultant', 'manager')`, and a billing persona never reaches this line — it is refused
earlier, with `/problems/insufficient-role`, asserted in `org-chart.int.test.ts`. The comparison
picks between two **response shapes** of one discriminated union: a consultant is answered
`{ role, manager }`, a manager `{ role, manager, reports }`.

It is not the first. The dashboard handler on `main` has two of the same shape, and has had since
Phase 5 — the same union-by-role response, the same branch, no ADR. A rules audit of
`fix/qa-round-3-mobile` raised the new instance and correctly noted the rule as written admits no
exception. So the choice is not "keep this one line"; it is whether the rule means what it says or
means something narrower that three call sites have been quietly assuming for a month.

## Decision

**The rule is about authorization, and it is narrowed to say so: a handler must never compare a
role to decide _whether_ an actor may do something. It may compare one to decide _what shape_ the
answer takes, when the route has already declared the roles it serves and the response is a union
discriminated by role.**

Two conditions, both required, and both mechanical enough to check in review:

1. the route carries `config: { access: forRoles(...) }` naming every role that reaches the
   handler — so no comparison is standing in for a missing declaration;
2. every branch returns; none of them refuses, throws an authorization error, or narrows a query.
   A branch that changes _which records_ are read is a repository decision that has escaped into a
   handler, and this ADR does not cover it.

`BUILD-RULES.md`'s own line is amended to carry the narrowing, per its preamble ("If a rule and an
ADR disagree, the ADR wins and this file is wrong; fix it").

## Rejected option

**Split the endpoint in two** — `/api/v1/org-chart/mine` for a consultant, `/api/v1/org-chart/team`
for a manager — so each route declares one role and no handler branches at all. It is the reading
that keeps the rule absolute, and it is genuinely what the rule would demand.

It loses because the two answers are one concept read from two positions in the same hierarchy, and
splitting them puts the role comparison in the **caller** instead: `org-chart-panel.tsx` would have
to know which role it is rendering for in order to pick a URL, which is the same branch moved
somewhere with less context and no test around it. It also multiplies with the union: the dashboard
response has three arms, so the same reasoning would make three endpoints out of one, each with its
own query key, its own cache entry and its own loading state, to avoid one `if`.

**Returning `reports: []` to a consultant** — one shape, no branch — was the other option. It loses
on honesty: an empty array says "you manage nobody", which is a claim; `undefined` says "this
question was not asked of you", which is the truth. The test asserts the key's absence with
`toStrictEqual` precisely because the difference is the point.

## Reconsideration threshold

Reopen when a handler's role branch first does something other than pick a return shape — narrows a
query, skips a check, chooses a different repository call. That is the failure this ADR is holding
the door against, and at that point the narrowing has been used as cover and the absolute rule was
right.

Reopen also if the number of role-branching handlers passes roughly five. Three (two dashboard, one
org chart) is a pattern; five is a shape the type system should be carrying instead, through a
per-role handler map the route builds once.

## Consequences

Cheap: one endpoint per concept, one query key, one cache entry, and the union stays where the
client reads it.

Expensive: the rule is no longer a grep. "No handler compares a role" could be checked by looking
for `actor.role ===`; "no handler compares a role _to authorize_" cannot, and no lint rule expresses
it. It moves from a mechanical guard to a reviewing obligation — which is a real loss, and the
reason the two conditions above are written as things a reviewer can check in one pass rather than
as a principle.
