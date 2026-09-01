# ADR-0076 — A role gets one colour, everywhere it appears

- **Date**: 2026-08-31
- **Status**: accepted

## Context

QA round 1, item 4, asked for a distinct colour per role badge (`Consultant` / `Manager` /
`Facturation`), everywhere one renders. That request contradicts a written decision:
`docs/direction-visuelle.md` §4.5, quoted verbatim by a comment in `apps/web/src/routes/index.tsx`,
said the role badge takes the primary tint on the persona selector only, and is neutral-outlined
(`--muted-foreground` text, transparent fill, `--border`) everywhere else — "Roles are not statuses
and must not compete with them." That reading held from Phase 4 through QA round 1: `RoleBadge` did
not exist, and the SPA's three renderers of a role name (`routes/index.tsx`'s selector card,
`components/shell/persona-block.tsx`'s topbar identity block, and
`components/feedback/denied-state.tsx`'s definition list) each rendered it as plain or
uniformly-tinted text, never a colour that varied with which role it was.

Checked before deciding anything: `apps/api/src/web/style.css`'s `.tag.role-consultant` /
`.tag.role-manager` / `.tag.role-billing` (the no-JS shell's own role tag, `shell.ts`'s `roleTag`)
already assigns three **different** colours per role — `--accent` (blue), `--held` (amber),
`--settled` (green) — and has done so since that shell was written, with no ADR of its own. Those
three hex values are byte-identical to `apps/web/src/styles/globals.css`'s
`--tone-blue-text`/`--tone-amber-text`/`--tone-green-text`. The no-JS shell was never brought in
line with §4.5's "neutral everywhere but the selector" rule; the SPA was. Item 4 is therefore not
inventing a scheme — it is bringing the SPA into line with the one surface of this application that
already reads a role's colour as information.

## Decision

**One colour per role, everywhere a role renders, in both the SPA and the no-JS shell**:
`consultant` → blue (`--tone-blue-text`/`--tone-blue-fill`), `manager` → amber
(`--tone-amber-text`/`--tone-amber-fill`), `billing` → green
(`--tone-green-text`/`--tone-green-fill`). No new hue: three of the five existing status tones are
aliased under `--role-consultant-*`/`--role-manager-*`/`--role-billing-*`
(`apps/web/src/styles/globals.css`), the same three the no-JS shell already used under differently
named variables. `RoleBadge` (`apps/web/src/components/role-badge.tsx`) is the SPA's one renderer,
used by the persona selector's cards, the topbar's `PersonaBlock` (both the compact identity line
and the dropdown's detail row), and `DeniedState`'s definition list. The no-JS shell's
`style.css`/`shell.ts` needed no change — it already did this.

Dot-free, unlike `StatusBadge`: a role badge is text-on-fill only, no coloured dot. A role is not a
status, so it deliberately does not reach for the "dot + label" reading §4.1–4.3 reserve for the
twelve real statuses/tags/reasons — the same instinct §4.5's old text had, kept here in the shape of
the badge rather than in the absence of colour.

## Rejected option

Keep the neutral-outlined treatment everywhere but the selector, as §4.5 said until this ADR. It is
the option the SPA already implemented, and rejecting it is not costless: reusing status hues for
roles is exactly the "roles competing with statuses" collision §4.5 was written to avoid, and this
ADR accepts that risk rather than eliminating it. It survives review because a role badge and a
status badge never share a screen in this application — the topbar identity block, the persona
cards and the denied-state screen show no CRA or invoice status, and no status badge names a role —
so the collision is theoretical rather than observed. Inventing three brand-new hues instead of
aliasing existing ones was also considered and rejected: the palette already carries five status
tones, six mission tones and one dedicated Absence hue (twelve families), and a thirteenth for a
three-value enum that appears far less densely than a mission row would cost more in "which colour
means what" load than the three-role read this ADR asks for is worth.

## Reconsideration threshold

A fourth role added to `Role`, or a colour of the three that stops clearing WCAG AA contrast against
its own fill (verified by `apps/web/e2e/axe.spec.ts`, which this repository holds mechanically
rather than by manual audit — BUILD-RULES' own claim). Either one reopens this decision rather than
being patched around it.

## Consequences

**Easy**: a role is now readable at a glance in the topbar, on the selector, and on a denied screen,
without reading the label text — useful precisely because `apps/web/e2e/axe.spec.ts` already proves
the label is never colour-alone (every `RoleBadge` still renders `LABELS.roles[role]` as text). The
SPA and the no-JS shell now agree, which they did not before this ADR, without either one changing
its actual hex values. **Expensive**: the stated risk above — a role badge and a status badge
sharing a screen would now read as related when they are not — is accepted, not solved; if this
application ever grows a screen that shows both at once, this ADR's threshold is reached and a
redesign, not a patch, is what resolves it.
