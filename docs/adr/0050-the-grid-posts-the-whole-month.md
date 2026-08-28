# ADR-0050 — The entry grid posts the whole month, in half-day slots, and its totals are server-side

- **Date**: 2026-08-21
- **Status**: accepted

## Context

Until this task there was **no route that records a day or submits a Cra** — the open-questions row
of 19/08 says it plainly: "the consultant persona can therefore see its own month and change
nothing about it; the seeded `submitted` Cra exists because the seed wrote it, not because anyone
could." The same row refused to guess the shape in advance: "Building the routes now would mean
guessing what the grid posts — a day at a time, a month at a time, a diff — which is the guess this
file exists to refuse." This is the task that needs it, so this is where it is decided.

Three questions have to be answered together, because each constrains the others: **what a save
contains**, **what a cell is**, and **what "live totals" means** now that ADR-0049 forbids script.

## Decision

### 1. A save is the whole month, and it replaces

`PUT /api/v1/cras/{period}/entries` and the form that posts to `/consultant/cra/{period}` both
carry every filled slot of the month, and the month is **replaced**, not merged.

- **Replaced, because a merge cannot tell "left blank" from "not sent".** A day the consultant
  emptied has to disappear; with a merge there is no way to take a day back short of a second verb.
- **The whole month, because the completeness rule is a month-level rule.** `submit` refuses a
  month whose workable days are not all accounted for (task 1.5), so a per-day save can never be
  checked against the rule the month will be judged by — it would report success on each of
  twenty-two saves and fail on the twenty-third.
- **`PUT`, not `POST`**, on the API: sending the same body twice leaves the same month, which is
  what `PUT` means and what a form resubmission does anyway. **With one bound, stated rather than
  glossed**: that holds while the month is a draft, and stops holding the moment it is submitted,
  because ADR-0005 takes the Cra out of the consultant's hands — a replayed `submit: true` is a 409
  naming the transition, and there is a test for it. `PUT` describes the _representation_ being
  replaced, not an unconditional idempotency the aggregate does not offer.

One transaction covers save-and-submit. A save that half succeeded would leave a Cra that is
neither last month's record nor this one's.

### 2. A cell is a **half-day slot**, not a quantity

Each day has two selects — morning and afternoon — and each holds nothing, `absence`, or a mission.
Two adjacent slots on the same mission are folded into **one line of two half-days** at the edge;
anything else stays two lines of one.

ADR-0012 makes the half-day the storage unit, and this is the truest rendering of it. The
alternative — a mission and a quantity per row — makes the **split day** a special case, and the
split day is precisely the structural reason `CONTEXT.md` gives for putting the mission on the line
rather than on the day. A form whose shape contradicts the model's justification is a form that
will be argued with.

The slot is a fact about the **form**, never about the record: the domain has no morning, the
database stores no slot, and **the command carries no slot number either**. Which of the two boxes
a half-day came from changes nothing — not the invoice, not the totals, not a rule — so it is not
recorded and does not travel. A `slot` field on `HalfDayEntry` was written and then removed for
exactly that reason: a value the code declares and never reads is a defect in a repository whose
thesis is that declared things are enforced.

The visible consequence, which a reader will meet before they meet this ADR: **a split day may come
back with its two missions in the other box.** The record says "half a day on A and half a day on B
on the 11th", and the grid renders that in a stable order — the repository reads
`ORDER BY day, mission_id` — rather than in the order it was typed. That is the truthful rendering
of what is stored, and preserving the typed order would mean a column carrying no rule.

### 3. "Live totals" means **current**, not per-keystroke — and that is a narrowing

BUILD-PLAN 6.3 says "a days × lines table with **live totals**". Read as per-keystroke, that is
client-side arithmetic, and it is forbidden twice over: ADR-0049's `default-src 'none'` means a
browser will not run a script, and ADR-0009's reconsideration threshold names this exact case —
"the first genuinely interactive one — **a Cra grid with client-side series entry**" — as the signal
that would reopen the no-framework decision.

**The threshold is not reached.** One grid is not the ten screens ADR-0009 names, and spending a
reconsideration threshold on the cheapest possible interactivity is how a "no client framework"
decision becomes a framework. So the totals are computed on the server and are current as of the
last save.

This is recorded as a decision rather than read as an interpretation, because the plan says one
thing and the screen does another, and an unrecorded narrowing is the silent omission the build
order forbids.

**No "copy last month"**, as BUILD-PLAN requires: it copies last month's mistakes too, and a month
that was wrong twice is harder to argue with than a month that was wrong once.

### 4. The consultant is the actor; the URL carries only a period

`/consultant/cra/2026-06` and `/api/v1/cras/2026-06/entries` name a month and never a person. "May
I write someone else's month" is therefore not a question this code answers — it is a question it
cannot be asked. That **removes** a check rather than adding one, which is the stronger form: the
route's `forRoles('consultant')` still says who may act, and the repository's `own` scope
(ADR-0003) still guards the read.

Field names in the form are `YYYY-MM-DD:0` and `:1`. Zod validates the one field whose name is
fixed (`action`) and the schema is `looseObject`, because **the field names are data** — they are
the days of a month, and no schema can enumerate them without knowing which month. A regular
expression is the boundary check for the rest, and it is an allowlist: a name that is not exactly a
date and a slot is dropped, never interpreted. Whether those days belong to the period, are
workable, or name a real mission are domain questions, and the domain answers them with typed
refusals (ADR-0042) rather than a silent drop.

## Rejected option

**One save per day, as most timesheet tools do.** A form per row, a save on change. It is the
obvious design and it loses on all three counts above: it cannot be checked against the
completeness rule, it needs a second verb to clear a day, and — decisively, with no script — each
save is a full page reload, so a month costs twenty-two round trips. It would also make the split
day a two-step operation.

**A diff — send only what changed.** Smaller bodies, and it survives two people editing at once.
Rejected on cost against benefit: nobody else edits a consultant's own month (the actor _is_ the
consultant), the body is at most sixty-two short fields, and computing a diff with no script means
the server holds the previous state anyway. It would buy optimistic concurrency for a document with
one writer.

**A quantity per row (`mission` + `0,5 / 1 jour`).** Fewer controls, and closer to how most CRAs
print. It loses on the split day, as above, and on ADR-0012: a decimal in a box invites `0.5`,
which is a float on a quantity the domain stores as an integer — the same class of mistake ADR-0002
rules out for money.

**Reaching ADR-0009's threshold and adding client-side totals.** Honest, and it would give the
"live" the plan literally asks for. Rejected because the threshold exists to be spent on a real
need, and a sum of at most sixty-two integers recomputed on save is not one.

## Consequences

**Easy.** One entry point, `recordMonth`, serves both representations — the screen posts a form to
it, `/api/v1` sends it JSON — so there is no second copy of "replace the month, then maybe submit".
The 409 a consultant sees on a submitted month is the domain's `CraTransitionError`, rendered; the
screen owns no copy of ADR-0005's rule and renders read-only from the same status the aggregate
reports.

**Expensive.** The totals lag the boxes until the page is saved, and a consultant filling twenty-two
days sees no running sum. Stated rather than hidden: the page says the totals are as of the last
save. Second cost: a month is one form, so a submit that the domain refuses refuses the whole
month — which is correct (a month is the unit the rule judges) and is also the least forgiving thing
in these screens. The refusal names the day, which is what makes it workable.

Third, a real limitation: **two slots per day means a consultant cannot record three different
missions in one day.** That is a deliberate consequence of ADR-0012 rather than of this form — the
half-day is the storage unit, so a third mission has nowhere to go. It is in the README's list.

## Reconsideration threshold

Reopen the **whole-month save** at the first month a consultant cannot complete in one sitting — a
grid that spans a quarter, or a month with a hundred entry lines. That is when the "one form, one
transaction" trade turns and a per-day save with an explicit "month complete" action becomes the
better shape.

Reopen the **server-side totals** exactly where ADR-0009 says: roughly ten screens, or a grid where
re-rendering per change stops being acceptable. The answer then is Vue over the existing API and a
`script-src 'self'` in ADR-0049's policy, changed in the same commit as the script.

Reopen the **half-day slot** if a third granularity is ever needed — hourly billing on a SOC
mission is the case, and it is already in the README as a billing-engine question. It would move
ADR-0012, not this ADR.
