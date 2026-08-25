# ADR-0068 — The grid's slot control is a native `<select>`, not shadcn's `Select`

- **Date**: 2026-08-25
- **Status**: accepted

## Context

The longest month the grid renders has 31 days × 2 slots — up to 62 simultaneous controls, each
choosing between nothing, "Absence", or one of the consultant's staffed missions. The stack
decision (`docs/BUILD-RULES.md`, `docs/frontend-plan.md` §1) names shadcn/ui — Radix primitives —
as the component kit, and `components/ui/select.tsx` (Radix `Select.Root`) is what every other
picker in the SPA is built on.

Task 6.2 also asks for a specific keyboard contract on this screen: "flèches entre créneaux,
ouverture au clavier, focus toujours visible" — arrow keys move focus **between cells**, not only
between the open options of one control. Deciding whether an arrow press should move focus or
navigate an open listbox requires knowing whether the control is currently open, and Radix's
`Select` exposes no such signal to a plain `keydown` handler on the trigger — its open/closed state
lives inside the primitive, reachable through its own controlled-`open` prop, not through the DOM
event the grid would need to intercept first.

## Decision

The grid's slot control is a plain HTML `<select>`, styled with the same tokens the rest of the kit
uses (`--input` for the control boundary, `--ring` for focus, 8px radius — `docs/direction-visuelle.md`
§3.1/§3.4), not `components/ui/select.tsx`. Arrow-key navigation between cells is implemented by
intercepting `ArrowUp`/`ArrowDown`/`ArrowLeft`/`ArrowRight` on the control's own `keydown` and
moving focus imperatively to the neighbouring cell's `<select>`; `event.preventDefault()` on the
vertical arrows is required, and is exactly what stops a browser's native behaviour of cycling a
closed, focused `<select>`'s own options on `ArrowUp`/`ArrowDown` — `ArrowLeft`/`ArrowRight` carry
no such native meaning on this element, so the horizontal case needs no suppression.

## Rejected option

**`components/ui/select.tsx` for every slot.** Not a rejection of the kit generally — every other
picker in this SPA still uses it — but wrong at this screen's specific scale, for two compounding
reasons:

1. Up to 62 simultaneous Radix `Select` instances each mount a portalled listbox. Nothing else in
   this kit is instantiated at that multiplicity, and an untested assumption at 62× is a more
   likely source of an axe violation or visible jank than a plain form control that browsers
   already optimise for exactly this shape (a dense form with many independent selects).
2. The arrow-key contract above needs a reliable open/closed signal at the moment of the keypress,
   which a native `<select>` resolves for free (the browser's own arrow behaviour on a closed
   control is precisely the behaviour `preventDefault()` suppresses) and Radix's `Select` does not
   expose to a `keydown` listener without wiring the primitive's own `open` state through every one
   of 62 instances first.

## Reconsideration threshold

Revisit if the grid needs an option with content a plain `<option>` cannot render — an icon, a
two-line label, an inline disabled reason on a mission that stopped running mid-month. That is the
point at which Radix's extra weight buys something a native control cannot, and today's grid does
not ask for it: every option is one line of plain text.

## Consequences

**Easy.** One Tailwind class list styles all 62 controls exactly like every other input in the
kit; screen readers get a control every one of them already knows from the rest of the web, at no
portal cost; the axe budget for this screen is spent on its actual structure (a `<table>`, labelled
controls, visible focus) rather than on 62 nested overlays.

**Expensive.** The slot control's open listbox uses the operating system's native chrome, which
looks very slightly different from `components/ui/select.tsx` used elsewhere in the app — a
difference `docs/direction-visuelle.md` did not call out before this ADR, and now does.
