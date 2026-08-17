# ADR-0003 — Authorization lives in the repository, not in Postgres RLS

- **Date**: 2026-08-17
- **Status**: accepted

## Context

The firm has 4 offices and 5 practices. A manager reads their own office; margins and Tjm are not
readable across offices. Some missions additionally require a certification-backed habilitation
(a PASSI-qualified auditor on a qualified mission), which is a rule about the pairing of a person
and a mission rather than about a role.

One of the mockup's stated claims is that a test proves a manager in one office cannot read the
margin of a mission in another.

## Decision

Scope filtering is applied in the **repository**, at the point where an aggregate is loaded. That is
the single place data enters the application, so no screen and no endpoint can forget it.

Row-Level Security is not used. The database has two roles (a schema-owning migration role and a
least-privilege application role), but it carries no authorization policy.

## Rejected option

**Postgres RLS**, as a set of policies on the tables. It is the stronger control on paper: it holds
even against direct database access, and it survives a module that forgets a filter.

It loses on **testability**, which is rule 3 of `CLAUDE.md`. RLS requires the connection to carry
the user's identity — a `SET LOCAL` per request, and a connection lifecycle that guarantees it.
Every authorization test then needs a live Postgres with role switching, and the claim above becomes
an infrastructure test rather than a domain test. At the repository, the same proof runs in
milliseconds without a database. It also expresses the habilitation rule, which is awkward in SQL.

**Both, as defence in depth** is the tempting third answer and the worst one available here: two
sources of authorization truth, hand-maintained in parallel, drifting within weeks. It only becomes
defensible if both are generated from one source, which is not a three-week undertaking.

## Reconsideration threshold

Reopen the day **anything other than this application connects to the database** — a BI tool, an
analyst with a psql prompt, a second service, a data export pipeline. At that point the repository
stops being the only door and RLS becomes necessary rather than redundant.

## Consequences

Authorization is testable without infrastructure, readable in TypeScript, and able to express rules
SQL renders poorly.

The cost is that the guarantee holds only for code that goes through a repository. A raw query
written in a hurry bypasses it entirely, and nothing in the database would stop it. That is the
price of the choice and it should be stated out loud rather than discovered.

Consequence for the interface: the correct demonstration is in two beats, not one. The out-of-scope
mission is **absent from the list** (an empty state), and a **direct API call on its URL is refused
with a 403 that names the rule that denied it**. The first alone invites "that is just a hidden
button"; the second is what proves the filter lives under the UI rather than in it.
