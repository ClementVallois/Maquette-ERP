# Demo checklist

The exact script for the CEO demo (`docs/frontend-plan.md` Phase 10, task 10.4), run against the
seed (`2026-06`, ADR-0022) and nothing else — no fixture invented for this document, no step it
asks a presenter to take that the running application cannot actually produce.

**This document is also the spec.** Every step below names the automated test that proves it holds
today, rather than duplicating that test's assertions here in prose that could quietly drift out of
sync with the code. Two specs carry the narrative: `apps/web/e2e/journeys.spec.ts` (the mutating
steps, Annexe B's J1–J6, run in the file's own declared serial order) and `apps/web/e2e/axe.spec.ts`
(the accessibility pass on the screens the narrative visits). Replaying the checklist by hand is
replaying those two files; a presenter who wants to see it live runs:

```sh
pnpm run db:reset
pnpm run api &
pnpm --filter @erp/web exec playwright test journeys.spec.ts --project=journeys
```

or opens the app at `http://127.0.0.1:5173` (dev topology) or the served build (`E2E_SERVED_BUILD=1`,
`http://127.0.0.1:3000` — the only topology that sends the application's own CSP, ADR-0072) and
clicks through by hand, in the same order.

## 0 — Reset

`pnpm run db:reset` (or a cold `pnpm run setup`). The seed is deterministic (ADR-0022,
`SEED_TIMESTAMP_MS`): the same four consultant ids, the same June data, every run.

## 1 — The selector

Land on `/`. The notice above the persona grid is the API's own words
(`GET /api/v1/personas`'s `notice` field), not a paraphrase — in French, "Cette maquette n'a pas
d'authentification : on choisit une identité, et tout le monde peut choisir n'importe laquelle."
Say it out loud; do not soften it into "login."

- **Proof**: `journeys.spec.ts`, describe `demo checklist — the opening beat: the selector, notice
visible`.
- **Accessibility**: `axe.spec.ts`, describe `accessibility — Sélecteur de persona`.

## 2 — Alice (`consultant-paris`): the grid

Choose Alice. Open `/cra/2026-06` (validated) to show the seed's own shape: the **11/06** row is
split across two missions on the same day (Audit DORA and Audit PASSI), one line is recorded as
**four separate quarter-days** rather than one whole day (ADR-0069), the **18/06** is an absence,
and **Saturday 13/06** is worked and flagged (a weekend day, deliberately kept in the seed to prove
the flag renders). Then open a fresh future month, fill a row, save, submit.

- **Proof**: `journeys.spec.ts`, describe `J1 — consultant-paris (Alice): the seed on 2026-06, then
a matrix edit/save/submit` (all three tests) — the first test is the read-only walk of exactly
  the shapes named above; the second is the fill/save/submit.
- **Accessibility**: `axe.spec.ts`, describe `accessibility — Mon CRA` (all three states: the list,
  the validated grid, the editable grid).

## 3 — Bruno (`manager-paris`): dashboard, then the decision

Switch to Bruno. Land on `/tableau-de-bord?period=2026-06` first — the **CRA en attente de
décision** card reads **1** (Claire's submitted June), not 0. `?period=` is what makes this step
reproducible on any date the demo happens to run: the screen's organic, picker-less default is
still the wall-clock month (`docs/open-questions.md`, row settled 27/08/2026, task 10.4), and June
is what has data.

Then `/pre-facturier?period=2026-06`: **validate Claire's month**. The result dialog names one
draft invoice, addressed to Réunion Cyber Services (the seed's 8.5% VAT client), and **no declined
day** — Claire's assignment is fully billable, so "nothing declined" is the honest result for this
row, not an unfinished feature. _(No persona in the seed can drive a validation that produces a
non-empty declined-days list live — the only Forfait-assigned consultant, Gabrielle, has no
persona. If a future demo needs to show a real decline, that is a seed change, not a UI gap.)_

Then, off the same row: **the margin screen**, reached by the one link the pré-facturier table
offers per row (never a hover, ADR-0052) — Claire's CJM, her one mission's Tjm/revenue/cost/margin,
and the totals StatCards agreeing with the mission row's own figures.

Then, back on the pré-facturier: **refuse Alice's submitted month** (the one J1 just created) with
a reason. Switch back to Alice and confirm the reason renders on her own grid, matrix re-editable.

- **Proof (dashboard + validation + margin)**: `journeys.spec.ts`, describe `J2 — manager-paris
(Bruno): validates Claire’s submitted June, drafts the Réunion invoice` — the dashboard read is
  that test's own opening lines, before it navigates to `/pre-facturier`.
- **Proof (refusal)**: `journeys.spec.ts`, describe `J3 — manager-paris (Bruno): refuses the month
Alice submitted in J1, with a reason`.
- **Accessibility**: `axe.spec.ts`, describes `accessibility — Tableau de bord (task 8.4, three
roles)`, `accessibility — Pré-facturier` and `accessibility — Marge`.

## 4 — Emma (`manager-lyon`): the office boundary

Switch to Emma. Deep-link a Paris Cra (Alice's validated June, by id). The screen is the designed
refusal — "Accès refusé", `/problems/out-of-scope` — not a crash and not a silent empty page: the
record exists, and Emma's office does not reach it.

- **Proof**: `journeys.spec.ts`, describe `items 4/5 — a manager sees consultants, picks one, opens
a read-only CRA (ADR-0071)`, test `a manager of another office is refused, out-of-scope, on the
same deep link`.
- **Accessibility**: `axe.spec.ts`, describe `accessibility — États 403/404`, test `out-of-scope`.

## 5 — Henri (`billing-paris`): issuance, the printable, and the other 403

Switch to Henri. Open `/factures`, open the Réunion Cyber Services draft J2's validation left
behind, and **issue it** through the dialog — the `Idempotency-Key` header shown in the dialog is
the real one the confirm click sends. The allocated number is the series' first ever in this
database: `SEC-2026-000001`. Replay the same key at the API directly and show `replayed: true`,
same number — the guarantee that protects a retried click.

Then click **"Version imprimable"**: it opens the server-rendered `/facture/:id` in a new tab, the
same document `GET /facture/:id` has always served (ADR-0055) — not a second copy built by the SPA.

Then deep-link a margin URL as Henri. Billing is refused by **role**, not scope — the designed
403 names `insufficient-role`, distinct from Emma's `out-of-scope` above.

- **Proof (issuance + replay)**: `journeys.spec.ts`, describe `J4 — billing-paris (Henri): issues
the draft J2 created, with a key, then proves the replay`.
- **Proof (printable)**: the same test, the "Version imprimable" step added for this task —
  asserts the popup's document is `main#contenu` (SSR), not `#root` (SPA), and shows the issued
  number.
- **Proof (role refusal)**: `journeys.spec.ts`, describe `J6 — billing-paris (Henri): the margin
URL refuses him, by role, and names the rule`.
- **Accessibility**: `axe.spec.ts`, describes `accessibility — Factures` and `accessibility — États
403/404` (`insufficient-role`), plus the styled 404 in the same describe (no step above visits a
  broken link on purpose, but the screen exists and is gated the same way).

## 6 — Back to the selector

"Changer de persona" from the topbar's own persona menu, from any role, returns to `/` — the same
menu item every persona above uses to switch, proven generically rather than once per role (the
component behind it is not per-persona).

- **Proof**: `journeys.spec.ts`'s `switchPersonaViaUi` helper, exercised by describe `item 1 —
switching persona drops stale data without a reload`.

## Known gaps in this script

Two states this mockup can render have no live persona that reaches them today, both recorded in
`docs/open-questions.md` rather than silently absent from this document:

- **The Cra list's empty state** (`features/cra/components/cra-list-screen.tsx`'s `EmptyState`).
  `GET /api/v1/cras` has no period filter — it lists every Cra the actor's scope can see, ever —
  and all four seeded personas already have at least one. Reaching it needs a seed change (a fifth
  persona with no assignment, or one of Lyon's two consultants losing theirs), which is Clement's
  call, not this task's to make unilaterally. Row: `docs/open-questions.md`, dated 27/08/2026,
  narrowed 27/08/2026.
- **A validation that declines a day.** Every seeded, persona-reachable Cra bills cleanly; the one
  Forfait-assigned consultant (Gabrielle) has no persona. Noted in step 3 above rather than staged
  as a step this script cannot actually produce.

Neither gap blocks the demo: both states are real, reachable code (verified by reading), just
unproven by an automated screen capture. Task 10.6's baseline freeze does not include either.
