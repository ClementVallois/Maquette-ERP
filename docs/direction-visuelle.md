# Visual direction — the SPA shell, its palette, its statuses

Task 0.2 of `docs/frontend-plan.md`. This note is the input to Phase 2 (design system): shadcn/ui is
initialised **with the palette below**, not with its default one, and `styles/globals.css` carries
these tokens verbatim.

It decides colour, type, density and layout. It does not decide components — Phase 2.3 lists those —
and it does not decide motion beyond the two tokens in § 8, which Phase 2.7 owns.

The references that seeded it were five external dashboard mockups (an invoice list, a KPI home, a
coworker table, a payments history, a multi-step project form). They are **not versioned in this
repository**: they were working material, they are described here in prose, and nothing in the
build depends on them. What follows is what survived the reading of them, and what did not.

## 1. What the references establish, and what is refused

**Kept** — the shape is right for a dense internal tool, and it is the shape a decision-maker
recognises as a real product:

- a **dark, near-black sidebar** with icon + label, a marked active state, collapsible to icons;
- a light, neutral content ground with **white cards** floating on it;
- a topbar carrying the page title (and a breadcrumb where the route is nested), with the identity
  block pushed right;
- **KPI cards**: one large number, one label, at most one line of sub-text;
- **dense white tables** with a quiet header row, pill status badges (coloured dot + French label),
  a toolbar above and a pagination footer below;
- **one** accent colour, in the blue/indigo family — appropriate for a cybersecurity firm, and the
  orange of one of the references is explicitly refused;
- a sans-serif interface face, radii in the 8–12 px band, shadows barely visible.

**Refused**, and each refusal is a fact about this application rather than a taste:

| In the references                      | Why it does not ship here                                                                                                                       |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| “↑ 15 % vs last month” under every KPI | The seed holds **one** period. A delta would be invented, and this repository's whole argument is that its numbers are computed, not decorated. |
| Donut and sparkline charts             | Same reason: a trend line over a single period is a visual lie. Phase 8.4 says so too.                                                          |
| Notification bell with a badge count   | Nothing in this system emits a notification. A bell that never rings is a mockup tell.                                                          |
| Global search field in the topbar      | Nothing is searchable across screens. A search that filters one table belongs **in** that table's toolbar.                                      |
| User photographs in avatars            | There are no users — there are four personas, and the selector says so out loud. Personas get **initials**, never a stock face.                 |
| “Welcome back, Jane 👋”                | No emoji in application chrome. The topbar names the page, not the visitor.                                                                     |
| “Log Out” at the foot of the sidebar   | There is no authentication. The action is **« Changer de persona »**, and it is worded that way everywhere.                                     |
| Row checkboxes and bulk actions        | No bulk operation exists in the CRA → invoice chain. A checkbox column that leads nowhere is furniture.                                         |
| Orange as the accent (one reference)   | Reads consumer-fintech. The accent here is the one already on the printable documents (§ 3).                                                    |

## 2. The constraint that fixes the accent

The two printable documents — `GET /facture/:id` and `GET /releve/:id` — keep their server-rendered
stylesheet (`apps/api/src/web/style.css`) through Phase 9, and the SPA **opens them in a new tab**.
So the two renderings sit side by side in the same demonstration, minutes apart.

The palette below therefore **extends** that stylesheet rather than replacing it: the accent
`#1f4d7a`, the ink `#1b1f24`, the soft ink `#4a5560`, the rule `#d8dce1` and the three semantic
families (`refused` / `held` / `settled`) are carried over unchanged. What the SPA adds is a page
ground, a dark sidebar scale, control-boundary and focus-ring values, and the status vocabulary of
§ 4 — none of which the printables ever needed.

Colours were chosen so that every text pair clears the usual 4.5:1 and every non-text boundary the
usual 3:1. **No ratio is published**, here or anywhere: the README's accessibility row states that
no contrast figure is claimed (ADR-0061), and this note does not quietly start claiming one.

## 3. Palette — shadcn token names, exact values

Light is the only theme. Dark mode stays in the README's “Ce que je ne construis pas”.

### 3.1 Surface and text

| shadcn token             | Hex       | Where it lands                                                        |
| ------------------------ | --------- | --------------------------------------------------------------------- |
| `--background`           | `#f4f6f8` | The page ground the cards sit on                                      |
| `--foreground`           | `#1b1f24` | All primary text (the printables' `--ink`)                            |
| `--card`                 | `#ffffff` | Cards, tables, panels                                                 |
| `--card-foreground`      | `#1b1f24` |                                                                       |
| `--popover`              | `#ffffff` | Dropdowns, dialogs, tooltips (tooltip inverts, see below)             |
| `--popover-foreground`   | `#1b1f24` |                                                                       |
| `--muted`                | `#eef1f4` | Table header row, inert chips, skeletons                              |
| `--muted-foreground`     | `#4a5560` | Labels, help text, table headers (the printables' `--ink-soft`)       |
| `--secondary`            | `#e9edf2` | Secondary button fill, toggled segment of a view switch               |
| `--secondary-foreground` | `#1b1f24` |                                                                       |
| `--border`               | `#d8dce1` | **Separators only**: card edges, table rules, dividers                |
| `--input`                | `#7c8792` | **Control boundaries only**: input, select, checkbox, unfilled button |
| `--ring`                 | `#2f6ea8` | Focus ring, 2 px, offset 2 px, never removed                          |

`--border` and `--input` differ on purpose, and the difference is the rule: a line that only
_separates_ content may be faint, a line that _is_ the edge of an interactive control may not.
Using `--border` on an input is the mistake this split exists to prevent.

### 3.2 Accent and destructive

| shadcn token               | Hex       | Note                                                                                 |
| -------------------------- | --------- | ------------------------------------------------------------------------------------ |
| `--primary`                | `#1f4d7a` | The printables' accent, unchanged. Primary buttons, links, active nav marker         |
| `--primary-foreground`     | `#ffffff` |                                                                                      |
| `--primary-hover`          | `#17395a` | Not a shadcn token; add it — hover/active of a primary button                        |
| `--accent`                 | `#eaf1f8` | shadcn's `--accent` is a **hover surface**, not the brand colour. Row and menu hover |
| `--accent-foreground`      | `#1f4d7a` |                                                                                      |
| `--destructive`            | `#8a1c1c` | The printables' `--refused`. Refusal, destructive confirmation                       |
| `--destructive-foreground` | `#ffffff` |                                                                                      |

Blue is the only brand hue. Green, amber and red appear **exclusively** in the status vocabulary of
§ 4 — never as a decorative surface, never as a second accent.

### 3.3 Sidebar scale

| shadcn token                   | Hex       | Note                                                                    |
| ------------------------------ | --------- | ----------------------------------------------------------------------- |
| `--sidebar`                    | `#121821` | Near-black with a blue cast, not pure `#000`                            |
| `--sidebar-foreground`         | `#c3cad4` | Idle item label and icon                                                |
| `--sidebar-accent`             | `#1a2230` | Hover fill                                                              |
| `--sidebar-accent-foreground`  | `#ffffff` |                                                                         |
| `--sidebar-primary`            | `#1e2c3d` | Active item fill                                                        |
| `--sidebar-primary-foreground` | `#ffffff` | Active item label                                                       |
| `--sidebar-border`             | `#232c39` | The rule under the brand block, the rule above the footer               |
| `--sidebar-ring`               | `#6aa5dd` | Focus ring **inside** the sidebar — `--ring` is too dark on this ground |

The active entry is fill + a **3 px left marker in `#4f8fce`** + white label. Fill alone is too
quiet at icon-only width, where the label that would carry the state is gone.

### 3.4 Radii and elevation

- `--radius: 0.75rem` (12 px) for cards, panels, dialogs; **8 px** for buttons, inputs, selects and
  menu items; **999 px** for status badges only.
- Two shadows, and no third:
  - `--shadow-card: 0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.06)`
  - `--shadow-overlay: 0 8px 24px rgb(16 24 40 / 0.12), 0 2px 6px rgb(16 24 40 / 0.06)`
- No coloured glow, no gradient surface, no glass blur.

## 4. Status colours — the real statuses, and nothing invented

Every value below exists in the code today. The French labels are quoted **verbatim** from
`apps/api/src/web/labels.ts`, which Phase 3.3 copies into `apps/web/src/lib/labels.ts`; a badge
never holds a string of its own.

A badge is always **dot + label**. Colour is never the only carrier of meaning, so a badge is
readable with the hue removed — which is also what makes the same component safe in a printed
screenshot.

### 4.1 Cra

| Status      | Label (verbatim) | Text      | Fill      | Dot       | Reading                                     |
| ----------- | ---------------- | --------- | --------- | --------- | ------------------------------------------- |
| `draft`     | « Brouillon »    | `#4a5560` | `#eef1f4` | `#6f7c8a` | Neutral: nothing has happened yet           |
| `submitted` | « Soumis »       | `#1f4d7a` | `#eaf1f8` | `#2f6ea8` | In the manager's hands — waiting, not wrong |
| `validated` | « Validé »       | `#1d5c33` | `#e9f4ec` | `#2a7d47` | Settled, and immutable (ADR-0005)           |
| `refused`   | « Refusé »       | `#8a1c1c` | `#fbeceb` | `#b23a3a` | Sent back, with a reason to display         |

**« En retard »** (`lateTag`) is **not** a status — it is a tag that rides alongside one
(ADR-0054): text `#7a5a10`, fill `#fdf4e0`, dot `#a97d16`. Amber is reserved for it precisely
because it is the only one of the five that asks someone to act. `submitted` is blue rather than
amber for the same reason: waiting for a decision is the normal course of the month, not a warning.

### 4.2 Invoice

| Status                  | Label (verbatim)         | Text      | Fill      | Dot       |
| ----------------------- | ------------------------ | --------- | --------- | --------- |
| `draft`                 | « Brouillon »            | `#4a5560` | `#eef1f4` | `#6f7c8a` |
| `issued`                | « Émise »                | `#1d5c33` | `#e9f4ec` | `#2a7d47` |
| `cancelledByCreditNote` | « Annulée par un avoir » | `#8a1c1c` | `#fbeceb` | `#b23a3a` |

Two deliberate reuses:

- `draft` is the same word and the same neutral as a draft Cra. Same meaning, same colour.
- `cancelledByCreditNote` reuses the red of `refused`, which is safe because **the two vocabularies
  never appear in the same table**: Cra statuses live on Cra rows, invoice statuses on invoice rows,
  and the pré-facturier keeps them in two separate tables (Phase 7.1). Giving cancellation a fifth
  hue would buy a distinction no screen can show.

### 4.3 Declined days (`declined[].reason`)

Shown in the validation result dialog (Phase 7.2) and in the pré-facturier. Two treatments, not
four, and the split is the whole point:

| Reason           | Label (verbatim)                               | Treatment                                                                          |
| ---------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| `notRegie`       | « Hors régie — mission au forfait ou interne » | **Neutral** `#4a5560` on `#eef1f4` — expected by design (ADR-0037), nothing to fix |
| `unknownMission` | « Mission inconnue de la facturation »         | **Amber** `#7a5a10` on `#fdf4e0` — a gap in the data, someone acts                 |
| `noAgreedRate`   | « Aucun TJM en vigueur à cette date »          | Amber, idem                                                                        |
| `unknownClient`  | « Client inconnu »                             | Amber, idem                                                                        |

Four colours for four reasons would imply a severity ordering the domain does not have. One colour
for all four would hide the only distinction that matters to the person reading the dialog: three
of them are somebody's next task, and one is simply how the firm sells.

### 4.4 The matrix (ADR-0070) — day flags, missions, absence

Written here in Phase 6, the phase the plan itself named as the one that decides this table's
content (front-end plan §6.2: "les valeurs exactes vont dans direction-visuelle.md §4.4"). ADR-0070
transposed the grid — missions on rows, days on columns — so a day is now a **column**, not a row;
the description below supersedes the row-tint reading this section held before the matrix existed.

**Day flags** (`days[].nonWorkable`). Not badges — the flag tints the **column**, header included.
Rendered, never blocking: the server flags a Saturday, it does not forbid it.

| Flag            | Label (verbatim) | Column tint | Marker                                       |
| --------------- | ---------------- | ----------- | -------------------------------------------- |
| `weekend`       | « Week-end »     | `#f4f6f8`   | Day number in `--muted-foreground`           |
| `publicHoliday` | « Férié »        | `#fdf9ef`   | Same, plus the label in `#7a5a10` at 11.5 px |

A cell the consultant has filled in stays fully legible on both tints — the fill is the record, the
tint is context.

**Day total over one working day** — client-computed (`features/cra/matrix.ts`'s
`isDayOverbooked`), not a server flag: the grid decides nothing, it mirrors the same bound the
domain enforces (`DayOverbookedError`) so the overrun is visible before the save that would refuse
it, not only after. Same red as `status-cra-refused` (`--flag-overbooked-bg` / `-text`, aliasing
`--tone-red-fill` / `--tone-red-text`), on two elements: the day's header column, marked with the
label « Dépassement » under the day number; and that day's cell in the « Total du jour » row, filled
red with an alert-triangle icon ahead of the figure and an `aria-label`/`title` naming the overrun
— colour is never the only signal. Deliberately **not** a full-column tint: tinting every cell down
the column would fight the mission-row tints already carrying meaning there, and the total row is
where the number the invariant is about actually lives.

**Workable day short of one full day** — the same bound from below, mirroring
`assertMonthAddsUp`/`IncompleteCraError`, and drawn the same way on the same two elements: the
header marked « À compléter », the totals cell filled with a dashed-circle icon ahead of the figure
and a sentence on `aria-label`/`title`. **Amber** (`--flag-incomplete-bg` / `-text`, aliasing
`--tone-amber-*`), never the red above it: a month still being filled is not a save that cannot
succeed, and one red for both would flatten the only distinction that matters while typing.

Which days carry it is a decision, not a threshold. A day nobody has typed into stays **neutral** —
it is a day not reached, not a mistake — so a fresh month opens entirely uncoloured, keeping §6.7's
"grille vierge invitante". Amber appears on a day that was _started_ and left short, and on every
day a refused submission named (`missingDays`, plumbed by `features/cra/missing-days.ts`), which is
where the zeros finally light up. A day stops being amber the moment it adds up, without waiting
for a second refusal to agree.

**Missions** (one row each, per ADR-0070). "Une teinte par ligne, stable dans le mois" — a pastille
in the row header plus a very light cell background, cycling through six hues by the row's position
among the grid's currently visible rows (`features/cra/mission-tone.ts`). Six, not five and not
eight: deliberately outside the status tones (§4.1-4.3) — a mission sharing a hue with `validated`
or `late` on the same screen would read as a status — and bounded by ADR-0070's own reconsideration
threshold (a seventh simultaneous mission is a staffing problem the row list itself would need
redesigning for, not a seventh hue).

| Tone | Fill      | Dot       |
| ---- | --------- | --------- |
| 1    | `#eef2fc` | `#4c5fb0` |
| 2    | `#e9f6f3` | `#2f8f7f` |
| 3    | `#fbf0f7` | `#a1428a` |
| 4    | `#fdf3ec` | `#c2634a` |
| 5    | `#eef7fb` | `#1f7a99` |
| 6    | `#f3f6e9` | `#71852b` |

**Absence** (the fixed row ADR-0070 adds unconditionally, never a value from `missions[]`). "Une
teinte propre, réservée, jamais celle d'une mission" — one dedicated hue, a muted violet chosen
precisely because none of the six mission tones or four status tones lean that way: text `#55447c`,
fill `#f2eff8`, dot `#6b5b95`.

**Not assignable this day** (`missions[].assignableDays` excludes the column, on a mission row).
Inert, `aria-disabled`, `bg-muted` at reduced opacity, no dot — a cell that offers nothing reads as
absent-of-interaction rather than as a sixth colour family.

### 4.5 Roles

`consultant` / `manager` / `billing` appear on the persona cards, in the topbar identity block, and
nowhere else. On the selector (Phase 4.1, the first screen of the demo) the role badge takes the
primary tint — `#1f4d7a` on `#eaf1f8`. Everywhere else it is **neutral outlined**: `--muted-foreground`
text, transparent fill, 1 px `--border`. Roles are not statuses and must not compete with them.

## 5. Typography

**Inter**, self-hosted (Phase 2.2 — `@fontsource` or local files; the CSP will allow `font-src
'self'` and nothing else). Fallback stack: `Inter, system-ui, -apple-system, 'Segoe UI', Roboto,
sans-serif`.

`:root` stays at 16 px; the interface is authored in `rem` on a 14 px body, which is the density the
references use and the density a nine-column billing table needs.

| Level                | Size / line-height                             | Weight | Colour               |
| -------------------- | ---------------------------------------------- | ------ | -------------------- |
| Page title           | 1.25 rem / 1.75 rem                            | 600    | `--foreground`       |
| Card & section title | 0.9375 rem / 1.375 rem                         | 600    | `--foreground`       |
| Body, table cell     | 0.875 rem / 1.25 rem                           | 400    | `--foreground`       |
| Label, help text     | 0.8125 rem / 1.125 rem                         | 500    | `--muted-foreground` |
| Table header         | 0.75 rem / 1 rem, `0.04em` tracking, uppercase | 600    | `--muted-foreground` |
| KPI figure           | 1.75 rem / 2.125 rem                           | 600    | `--foreground`       |

Two rules that are not decoration:

- **`font-variant-numeric: tabular-nums` on every number** — money, quarter-days, VAT rates, invoice
  numbers, dates. A column of amounts that does not align is the first thing a reader distrusts in
  a billing tool.
- **Invoice numbers and identifiers are monospace** (`ui-monospace, 'SF Mono', 'Cascadia Mono',
Menlo, monospace`), as they already are on the printables' `dl.facts`.

Money, days and percentages are never formatted in a component — `src/lib/format.ts` (Phase 3.4) is
the only place, and it mirrors the API's formatter output for output.

## 6. Layout

```
┌────────────────┬──────────────────────────────────────────────────────────────┐
│  ERP · CRA     │  Pré-facturier                        ┌────────────────────┐ │ 56 px topbar
│  [collapse ⟨]  │  Accueil / Pré-facturier              │ BL  Bruno Leroy  ⌄ │ │ --card, 1px --border
│                │                                       │     manager·Paris  │ │ persona block
├────────────────┼──────────────────────────────────────────────────────────────┤
│ ▸ Tableau de b.│                                                              │
│ ▸ Mon CRA      │   ┌──────────┐ ┌──────────┐ ┌──────────┐                     │
│ ▮ Pré-facturier│   │ 12 400,00│ │    3     │ │    2     │   StatCard row      │
│ ▸ Factures     │   │ € factur.│ │ j retard │ │   CRA    │   gap 16            │
│ ▸ Marge        │   └──────────┘ └──────────┘ └──────────┘                     │
│                │                                                              │
│                │   ┌────────────────────────────────────────────────────┐     │
│                │   │ Factures facturables            [toolbar]          │     │
│  248 px        │   ├────────────────────────────────────────────────────┤     │
│  (64 px        │   │ header row  ·  --muted  ·  36 px                   │     │
│   collapsed)   │   │ row 44 px · 12/16 padding · hover --accent         │     │
│  --sidebar     │   │ …                                                  │     │
│                │   ├────────────────────────────────────────────────────┤     │
│                │   │ pagination footer                                  │     │
│                │   └────────────────────────────────────────────────────┘     │
│────────────────│                        content max-width 1360, gutters 24    │
│  (reserved)    │                                                              │
└────────────────┴──────────────────────────────────────────────────────────────┘
```

- **Primary viewport 1440**, verified at **768** (Phase 1.5). Below `md` the sidebar becomes a
  `Sheet` opened from a topbar button; nothing else reflows structurally.
- **Sidebar** 248 px expanded, 64 px collapsed (icons + tooltips). Brand block on top, nav in the
  middle, and a **reserved, unpopulated zone** at the foot. The collapse state is a UI preference,
  not session state.
- **Topbar** 56 px, `--card` on a 1 px `--border`: page title, breadcrumb when the route is nested,
  and the **persona block** at the right — name, role, office, and the « Changer de persona »
  action (Phase 4.2). The strip beside it is the topbar's own reserved zone: it stays **empty**,
  because an empty reserved zone is more honest than a bell that does nothing.
- **Spacing scale** 4 / 8 / 12 / 16 / 24 / 32 / 48. Page padding 24, card padding 16 (20 for the
  KPI cards), gap between cards 16.
- **Tables**: header 36 px, row 44 px, cell padding 12 px vertical / 16 px horizontal, `hover`
  `--accent`, sticky header inside a scroll area on the grid. Numeric columns right-aligned,
  everything else left. The action column is last and never wider than its content.
- **Skip link** first in tab order, visible on focus — the printables already have one, and the SPA
  does not get to be worse than the pages it replaces (ADR-0061 is the floor).

**Not negotiable, restated here because it is a layout rule and not only a policy**: `Cjm`, `Tjm`
and margin appear on **no** list, no card, no tooltip, no expandable row. They exist on one screen,
reached by an explicit click, and every read is logged (ADR-0052).

## 7. Empty, error and denied states

They are deliverables, so they get a shape here rather than being improvised per screen:

- **Empty**: centred in the card, a 20 px lucide icon in `--muted-foreground` on a `--muted` disc, a
  one-line title in body weight 600, one line of help text, and — only when the persona's role
  carries it — one action. Never an illustration.
- **Error**: `--destructive` icon, the French sentence keyed by `problem.type`, and the
  `correlationId` in monospace 0.75 rem under it. The status code is never shown as a number.
- **Denied** (403): the same frame, but it names the rule (`deniedBy`) and the persona's role, and
  its tone is a demonstration rather than an apology — it is the screen the repository is proudest
  of, and it is styled like a result, not like a crash.

## 8. Motion

Two tokens, and Phase 2.7 owns their application: `--motion-fast: 120ms` (hover, focus, badge and
button state), `--motion: 180ms` (dialog, sheet, route transition), both `ease-out`. Everything is
wrapped by `prefers-reduced-motion: reduce`, which disables transform and opacity transitions and
keeps colour changes instant. No parallax, no entrance animation on a table row, no spinner where a
skeleton does the job.

## 9. The guardrail

The failure mode to avoid is not ugliness, it is **genericness** — a screen that could belong to any
SaaS and therefore proves nothing about this one. The rules that keep it out:

1. **A neutral base and exactly one accent.** No cream/terracotta, no black + acid green, no
   two-brand-colour gradient.
2. **Every figure on screen is computed.** No delta, no trend, no chart over a single period, no
   placeholder logo, no filler row.
3. **Nothing is rendered that cannot be clicked into.** No bell, no global search, no “settings”
   entry that opens nothing. A reserved empty zone is allowed; a fake control is not.
4. **French, and the firm's vocabulary.** `Cra`, `Regie`, `Tjm`, `Cjm`, `Intercontrat`,
   `Pré-facturier`, `Habilitation` are never translated and never softened; the persona selector is
   never called a login.
5. **Colour never carries meaning alone** — always a label beside the dot, always a word beside the
   tint.
6. **Remove before adding.** At the Phase 10.1 pass, every ornament that serves neither legibility
   nor hierarchy comes out.

## 10. What this note does not decide

- **Dark mode** — excluded, and it stays excluded in the README. The tokens are authored as CSS
  variables so a second theme is possible later, but none is defined and no component may read a
  raw hex that would have to be found again.
- **Charts** — none, while the data holds one period (Phase 8.4).
- **The component list** — Phase 2.3.
- **The exact icon per navigation entry** — Phase 4.3, from `lucide-react`, one line in
  `config/navigation.ts`.
