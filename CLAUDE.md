# CLAUDE.md — rules for this repository

## What this is

A working mockup of an internal ERP module for a **cybersecurity consulting firm (~300 consultants, 5 practices, 4 offices)**. It covers one end-to-end chain: **a consultant submits a timesheet (CRA), a manager validates it, and that validation triggers the generation of a draft invoice (time-and-materials billing).**

The CRA is the pivot of every consulting firm's economics: the same daily record feeds project tracking, staffing, and client billing. When it lives in a spreadsheet — or in three tools that don't talk to each other — every month-end is a manual re-entry, and every re-entry is a source of discrepancy between work delivered and revenue invoiced.

This mockup takes that single chain and proves, in code, that it can be built with **real module boundaries, enforced by CI** — not naming conventions.

## What this mockup sets out to prove

1. **A real module boundary, enforced mechanically.** The `billing` module cannot import the internals of the `timesheet` module; it reacts to a domain event published by it. Breaking the boundary **must fail the CI**, not produce a warning. At the demo, we break the boundary live and show the CI failing.
2. **Business invariants held by code, not by discipline:**
   - a validated CRA is **immutable**;
   - monetary amounts use **exact arithmetic — never a floating-point number**;
   - invoice numbering is **sequential and gapless**;
   - VAT is computed **per line**, not on the total.
3. **Authorization tested by role *and* by scope:** a manager in one office cannot read the margin of a mission in another office, and a test proves it.
4. **A CI security gate:** SAST, dependency scan, secret scan — the repo of a cybersecurity firm's internal tool must demonstrate on itself what the firm sells.
5. **Architectural decisions recorded when they are made** — `docs/adr/`. Each ADR names the rejected option and the threshold at which we'd change our mind.

## What it does NOT build

The README's "What I'm not building" section is the source of truth. Everything outside the CRA-to-invoice chain goes there, not in the code. This includes (non-exhaustive): fixed-price billing, actual invoice dispatch, accounting, payments, dunning, user management, production authentication.

**A mediocre mockup is worse than no mockup.** When in doubt, cut scope rather than ship half-built.

## Architecture rules (non-negotiable)

1. **Two modules, one arrow.** `timesheet` and `billing` are sealed. `billing` imports **nothing** from the internals of `timesheet`: it reacts to the `timesheet.TimesheetValidated` event. Any other cross-dependency is a bug, not a shortcut.
2. **The boundary is verified mechanically.** A dependency rule in CI enforces it. If a change requires bypassing the rule, we discuss the rule — in an ADR — not the bypass.
3. **The domain is pure TypeScript.** No framework, no ORM, no network or disk access in the domain layer: it is testable without a database.
4. **Never a floating-point number on a monetary value.** The exact representation (integer cents vs. `numeric`) is decided in an ADR; the invariant is absolute.
5. **A business invariant lives in the domain**, not in a controller or in a database constraint alone (the database may double it, never carry it alone).

## Working rules

- **One structural decision = one ADR**, written **at the time** of the decision (`docs/adr/`, template `0000-template.md`). Each ADR names the **rejected option** and the **threshold at which we'd change our mind**.
- **Do not expand scope.** Any idea outside the CRA-to-invoice chain goes in the "What I'm not building" section of the README, not in the code.
- **No test that proves nothing.** Priority: domain invariants, boundary crossing, authorization by role **and** by scope.
- **Everything in English.** Code, comments, commit messages, ADRs, documentation — all in English. `README.md` stays in French (it addresses a French-speaking reader who will open this repo cold, without a brief).
- **Commit messages matter**: the history is part of the deliverable. One commit = one step defensible out loud. **No co-author other than Clement Vallois** — no `Co-Authored-By` trailer, regardless of how the code was produced.
- **Do not add anything to the README that isn't true yet** (no stack, no architecture diagram until the ADR is written).
- **Clement codes the core.** The point is ownership he can defend, not a green repo. The agent assists, reviews, scaffolds infrastructure — the domain logic and the architectural decisions are Clement's.
- **Empty states, error states, and permission-denied states are part of the deliverable** — they are not polish, they are proof that the authorization model works.

## Dataset shape

The seed data must look like the reality of a consulting firm:
- **5 practices** (audit, SOC, GRC, IAM, offensive security)
- **4 offices** (Paris, Lyon, Rennes, Bordeaux)
- Time-and-materials **and** fixed-price missions (only T&M is invoiced by this mockup)
- One consultant in **bench** (intercontrat)
- One **certification-based habilitation** that constrains an assignment (e.g., PASSI-qualified auditor required on a qualified mission)

## Schedule constraint

- **Code freeze: 21/08.** The last days go to the README, ADRs, dataset, and states (empty/error/denied).
- **Ship: 24/08.** The repo must explain itself to a reader who has no brief and no context.
