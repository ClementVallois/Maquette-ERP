# CLAUDE.md — rules for this repository

> 🔴 **Before writing code, read [`docs/BUILD-RULES.md`](docs/BUILD-RULES.md), at every step.** It is
> the operative form of every decision taken — what may and may not be written. This file states the
> intent; that one states the rules; [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md) states the order,
> the branches, and the calendar. A rule
> there is not relaxed for convenience: it is either right, or it needs a new ADR.

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
   - VAT is rounded **per rate** — never per line, never on the total (ADR-0010).
3. **Authorization tested by role _and_ by scope:** a manager in one office cannot read the margin of a mission in another office, and a test proves it.
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
- **Everything in English**, with one deliberate exception. Code, comments, commit messages, ADRs, documentation — all in English. `README.md` stays in French (it addresses a French-speaking reader who will open this repo cold, without a brief).
- **French business terms stay French when translating them loses contractual or legal meaning** — `Cra`, `Regie`, `Forfait`, `Tjm`, `Intercontrat`, `Habilitation`, `Passi`. This is the firm's ubiquitous language, not sloppiness. Everything structural is English, and terms that translate without loss are translated (`pôle → Practice`, `implantation → Office`, `avoir → CreditNote`). `CONTEXT.md` is the authority: a term is not used in code until it is in there.
- **Commit messages matter**: the history is part of the deliverable. One commit = one step defensible out loud. **No co-author other than Clement Vallois** — no `Co-Authored-By` trailer, regardless of how the code was produced.
- **Do not add anything to the README that isn't true yet** (no stack, no architecture diagram until the ADR is written).
- **Clement owns the decisions; the agent writes the code.** Every architectural arbitration is Clement's and is recorded in an ADR at the time it is made. Because the code itself is delegated, `docs/adr/` and `CONTEXT.md` are not documentation _about_ the deliverable — they **are** the part of the deliverable he authored, and they are held to that standard.
- **Do not comment everything.** The reasoning lives in `docs/adr/` and `CONTEXT.md`; a comment that restates a decision duplicates it and rots. Write a comment only for a non-obvious _mechanical_ fact — a trap, a footgun, a setting that silently does nothing if written differently. If a comment explains _why we chose this_, it belongs in an ADR and the code should link to it instead.
- **Empty states, error states, and permission-denied states are part of the deliverable** — they are not polish, they are proof that the authorization model works.

## Dataset shape

The seed data must look like the reality of a consulting firm:

- **5 practices** (audit, SOC, GRC, IAM, offensive security)
- **4 offices** (Paris, Lyon, Rennes, Bordeaux)
- Time-and-materials **and** fixed-price missions (only T&M is invoiced by this mockup)
- One consultant in **bench** (intercontrat)
- One **certification-based habilitation** that constrains an assignment (e.g., PASSI-qualified auditor required on a qualified mission)

## Schedule constraint

- **`docs/BUILD-PLAN.md` is the authority on order and dates** (decision of 17/08/2026). Sized
  honestly, the full build runs to early September 2026 — **the date moves, the scope does not.**
  The "code freeze 21/08 / ship 24/08" pair this section used to state described a smaller scope
  and is superseded.
- **24/08 is a conversation date, not a finish line.** What goes out that day is defined in the
  plan's Calendar section: the hosted chain at `https://erp.clementvallois.fr` if Phase 8 has
  landed, otherwise the repository link with a README that states plainly which phases are merged
  and that the hosted instance follows.
- The repo must explain itself to a reader who has no brief and no context — that requirement has
  no date; it holds at every merge to `main`.

## The double checkpoint

At the end of **every sub-task (commit), every task, and every phase**, two questions, in order:

1. **Where and what am I least confident in, in what I just produced?**
2. **In three months, what breaks if I leave it as it is?**

Every point raised resolves to exactly **one** of four outcomes — never a silent pass: **fix now**
(it is a defect, corrected in the same task); **new ADR** (a decision made implicitly, to be written
down with its rejected option and its reconsideration threshold); **a row in the README's "What I'm
not building"** (out of scope, and the omission becomes deliberate and public); **a row in
`docs/open-questions.md`** (real, not yet decidable). The fourth carries an obligation the others do
not: the phase that will decide it is named, with a date — an open row with no named phase is a
deferral pretending to be a record.

Phase checkpoints are **written down** in `docs/open-questions.md`, which puts them in git history;
they also state explicitly **which tasks of the phase did not run and why**. Commit-level checkpoints
are resolved in place and leave their trace in the commit itself.

**Stop condition:** a checkpoint ends when every point raised has one of the four outcomes recorded.

> Full statement, with the history of how the fourth outcome was added:
> [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md), § "The double checkpoint".

## Agent skills

### Issue tracker

Issues live as GitHub issues on `ClementVallois/Maquette-ERP`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Subagents (`.claude/agents/`)

Two read-only reviewers, both run in a clean context on purpose — dispatch them, do not replay
their checklists inline:

- **`rules-auditor`** — blind audit of a diff against `docs/BUILD-RULES.md`. Before every merge to
  `main` and at every phase checkpoint.
- **`cold-reader`** — walks the repo as the no-brief reader. Before merging README/docs changes to
  `main`, and before the repo link goes out.
