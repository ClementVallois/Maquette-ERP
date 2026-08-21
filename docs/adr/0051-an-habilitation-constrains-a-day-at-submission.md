# ADR-0051 — An `Habilitation` constrains a recorded day, checked at submission

- **Date**: 2026-08-21
- **Status**: accepted

## Context

`CLAUDE.md` § Dataset shape requires, by name, "one **certification-based habilitation** that
constrains an assignment (e.g. a PASSI-qualified auditor required on a qualified mission)".

Migration 007 created `public.habilitations`, `public.consultant_habilitations` and
`public.mission_habilitations`. The seed fills all three: Alice holds PASSI since 15/03/2025, the
`Audit PASSI — Banque Nationale` mission requires it, and Alice is staffed on that mission. As of
21/08/2026 the three tables are also covered by an integration test.

**And nothing reads them.** The open-questions row of 21/08 states the problem exactly: "a
constraint that nothing reads constrains nothing. The seed stores the fact; no code enforces it."
So `CLAUDE.md`'s requirement was satisfied at the level of rows in a table and not at the level of
behaviour — which is the difference this repository spends its gates on everywhere else. The same
row named the same defect for four other tables, and the decision on those is separate (see
"Consequences").

## Decision

**A day recorded on a mission that requires an `Habilitation` the consultant did not hold _on that
day_ is refused at submission, as a fourth submission check alongside the three of task 1.5.**

Four consequences of putting it there rather than anywhere else:

- **`TimesheetReference` grows the projection, not `billing`.** An `Habilitation` decides _who may
  record a day_, which is a timesheet rule; what a mission is worth is the other module's
  projection. ADR-0031's split holds unchanged, and the composition root's
  `PgReferenceReader.timesheet()` is where the two new tables are read.
- **It is dated, like everything else that is dated here.** A qualification expires. A day worked
  in June is judged against June's certificate, exactly as June's `Tjm` bills it and June's manager
  validates it (ADR-0034). A consultant whose PASSI lapses on the 20th keeps the first three weeks
  and loses the rest — where an undated check would take the whole month or none of it.
- **The refusal names what is missing.** `missingHabilitations()` returns the list rather than a
  boolean, and `MissingHabilitationError` carries it. A refusal that says only "not qualified"
  leaves the consultant to guess which certificate to obtain and the manager to guess what to
  chase.
- **It is a 409, not a 422** (ADR-0042). The day and the mission are both perfectly good values;
  what refuses them is the state of the world on that date. That puts it in the same family as
  `not-assigned` and `mission-not-running`, which is where it belongs.

**Where the refusal is demonstrated: in a unit test, and the ADR says so rather than letting a demo
script imply otherwise.** The seeded dataset is deliberately compliant — Alice _holds_ PASSI — so
that `pnpm run seed` succeeds and the demo runs end to end. A dataset that violated the rule would
break the seed; one that complies never shows the rule firing. Both are true at once, so the
demonstration moves to `submission-checks.test.ts`, which proves the refusal, proves it names the
missing clearance, and proves the dated behaviour on both sides of an expiry. Phase 9's
`docs/demo.md` points at that test rather than at a screen.

## Rejected option

**Check the habilitation when the assignment is created, not when a day is submitted.** The more
natural reading of "constrains an assignment", and the one an ERP with a staffing module would
implement — you cannot staff an unqualified consultant, so no unqualified day can ever exist.

It loses on three counts here. First, **there is no assignment-creation path**: assignments are
reference data, and ADR-0031 makes the seed their single writer; a rule enforced only at a write
that nothing performs is a rule enforced nowhere, which is the exact defect this ADR exists to
close. Second, it cannot express the dated case: an assignment created in January is valid at
creation and says nothing about a certificate that lapses in March, so the check would have to run
again per day anyway. Third, it is the weaker control — it guards the staffing decision, while the
thing that reaches an invoice is the **day**, and the day is what this chain is about.

**A flag rather than a refusal**, in the family of the weekend flag: surface it, let the manager
decide. Tempting, because a weekend worked is genuinely the manager's call. It loses because the two
are not the same kind of fact. A weekend is a scheduling irregularity the firm may accept; a missing
PASSI qualification on a qualified mission is a **contractual and regulatory** defect, and a manager
is not the party who may waive an ANSSI qualification. The flag list is for things a manager may
accept; this is not one.

**Extend the `Mission` projection in `billing` instead.** Rejected in one line: `billing` never sees
a day before it is billable, so it would learn about the problem after the day had already been
validated and turned into a line.

## Consequences

**Easy.** `CLAUDE.md`'s dataset requirement is now true at the level of behaviour: three tables that
were written and never read have a reader, the constraint constrains, and a mutation of the guard
turns two tests red. The projection is one function on an interface the domain already had, so the
domain still performs no I/O and the check is a pure function of the record and the reference.

**Expensive.** `Mission.requiredHabilitations` is a **required** field rather than an optional one,
so every construction site — five test fixtures, the seed, the reference reader — had to say
`requiredHabilitations: []` explicitly. That churn is the point: an optional field would let the
next mission projection forget the clearance silently, which is the shape of the defect being fixed.

**What this does not fix, stated rather than implied.** The 21/08 row named **five** unread tables.
This ADR gives readers to three of them (`habilitations`, `consultant_habilitations`,
`mission_habilitations`). The other two — `public.grades` and `public.grade_tjm_defaults` — are a
separate decision taken the same day and go the other way: they are a default-rate lookup that
nothing in the CRA-to-invoice chain consults, because the rate that bills is the mission's dated
`Tjm`, and they move to the README's "Ce que je ne construis pas". `public.consultant_grades` keeps
its existing reader through `consultantEconomics` (ADR-0043).

## Reconsideration threshold

Reopen when an assignment can be created at **runtime** — a staffing screen, an admin route. At that
point the check belongs in both places: at staffing, so the mistake is caught when it is made, and
at submission, so a certificate that lapses after staffing is still caught. That is ADR-0031's own
threshold ("the first runtime writer of reference data") reached from the timesheet side.

Reopen sooner if a mission ever needs a clearance a manager _may_ waive. That would mean the binary
above is wrong and `Habilitation` needs a severity, at which point some of them become flags and the
flag list stops meaning "the manager decides".
