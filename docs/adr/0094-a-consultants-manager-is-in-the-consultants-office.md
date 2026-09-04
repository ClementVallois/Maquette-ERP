# ADR-0094 — A consultant's manager is in the consultant's own office

- **Date**: 2026-09-04
- **Status**: accepted

## Context

`scripts/lib/seed-data.ts` carried two `manager_attachments` rows that cross an office boundary:
Gabrielle Petit, a consultant in Bordeaux, reported to Bruno Leroy, a manager in Paris; François
Moreau, in Rennes, reported to Emma Robert, in Lyon. They were written before offices scoped
anything — the seed's own comment was the flat "Each consultant reports to a manager."

Two rules then meet and disagree. `Cra.validate()` asks the **hierarchy** who may accept a month
(`managerOf`, dated, ADR-0034), and answers Bruno. Every read Bruno makes is bounded by
`actor.officeId` (ADR-0042, and CLAUDE.md's proof point 3), so no screen he can open will ever show
him Gabrielle's `Cra`. The month is unvalidatable through the interface, and the only symptom is a
row that sits there: no error, no refusal, no screen that names the problem.

It was invisible only because the seed pre-validates both of their months. ADR-0090 decided the
_read_ side of this — the org chart stops at the office — and deliberately did not decide this half,
recording it instead as an Open row dated 04/09/2026 with three candidate answers.

## Decision

**A `manager_attachment` never crosses an office.** The seed is the only writer of that table in
this mockup, so the invariant is enforced where it is created:

- Gabrielle Petit reattaches to **Karim Faure**, Bordeaux's own manager (added by item 6 of QA
  round 1, non-selectable);
- **Rennes gains its own manager**, modelled exactly on Karim — same practice as the office's one
  consultant, no `Cra` of his own, reporting to Henri like Bruno and Emma, and **not** in the
  persona picker, which stays at exactly four entries (ADR-0023);
- François Moreau reattaches to him.

The seed's comment above `managerAttachments` now records the rule and its mechanical reason,
because the next person to add a consultant is the person who would reintroduce the defect.

`validate-cra.ts` is untouched: it keeps asking the hierarchy, and ADR-0034's dated-manager
property — March's `Cra` is accepted by March's manager, even when it is validated in June — keeps
being true and keeps being tested.

**What this does to ADR-0090.** Its decision stands unchanged: the org chart is still the
intersection of office roster and hierarchy, and the N+1 half still answers a manager's name
upward without an office filter. But its § Decision closes with an illustration —
"`manager_attachments` gives Bruno twenty open reports, and the panel shows him nineteen. The
missing one is Gabrielle" — and that sentence is **now historical**. ADR-0045 forbids editing an
ADR after the fact, so it is corrected here rather than there. This is also ADR-0090's own
reconsideration threshold firing, the second of the two it names: "the seed stops carrying
cross-office attachments, in which case this decision is untestable by construction and
`org-chart.int.test.ts`'s fixture, which builds its own, becomes the only place the distinction is
visible." That is now the state of affairs, and it is survivable precisely because that test was
built on its own fixture instead of on the seed.

## Rejected option

**Model a manager's authority as spanning offices** — authority follows the person, not the place.
It is the realistic reading (a satellite office of one genuinely reports to a regional manager) and
it is what ADR-0090's _first_ threshold anticipates. It loses here because office scope is this
mockup's entire authorization story: it is proof point 3 in CLAUDE.md, it is ADR-0042, and it is
asserted by role **and** by scope in the test suite. Widening it would mean a second rule beside
`actor.officeId` on every scoped read, to make one seed row work.

**Make `validate-cra.ts` ask the office instead of the hierarchy.** The smallest domain change, and
the worst trade: it discards ADR-0034's dated attachment, which is built, tested, and one of the few
places this mockup shows that a temporal rule was thought about at all. Consistency bought by
deleting the more interesting invariant.

## Reconsideration threshold

Reopen when the firm's model gains a manager whose team legitimately spans offices — a practice
lead, a regional director. At that point this ADR is not wrong so much as superseded by a change to
ADR-0042, which has to move first: the boundary is the thing being revisited, not the seed that
respects it.

Reopen also if `manager_attachments` ever gains a second writer — an admin screen, an import. The
invariant is currently held by the one script that writes the table, which is enough while that is
true and is not a domain rule; a second writer makes it one, and it belongs in `packages/timesheet`
with a test.

## Consequences

Cheap: every seeded `Cra` is now validatable by someone who can actually see it, which is what the
demonstration claims. Nothing in the domain, the API or the SPA changed — the fix is data.

Expensive: the roster gains a person, so `48 consultants / 3 managers` becomes `49 / 4` in
CLAUDE.md, in the README's "Jeu de données", and in every test that counts them. And the seed no
longer exercises the cross-office case at all, which means the one place the office/hierarchy
distinction is still proved is `org-chart.int.test.ts`'s hand-built fixture. Delete that fixture and
nothing fails, while a real modelling question quietly stops being represented anywhere.
