# ADR-0096 — The company-news carousel gets fixed arrows, a CSS timer, and a narrow-width fallback

- **Date**: 2026-09-04
- **Status**: accepted

## Context

Item 1, QA round 5, asked for five changes to the company-news module (`company-news-panel.tsx`,
item 17 of QA round 3): the previous/next arrows sat in a row that moved down whenever a longer
message grew the row above it, instead of framing the text at a fixed position; the timer bar
visibly incremented in 2%-wide blocks (`PROGRESS_STEP`, chosen at the time to avoid a 60fps
re-render); message-to-message changes were a hard replacement; and the pause-on-hover/focus
handlers sat on the message row rather than the whole module, so hovering the heading or the
visibility toggle did not pause the rotation. A sixth change — a new illustration for the security
item — is a content swap, not a structural decision, and needed no ADR of its own.

Fixing the arrow position means anchoring them to the module's edges, which needs room the module
does not have on a narrow phone next to readable text — the repository's own acceptance criterion
(`apps/web/e2e/responsive.spec.ts`) is `document.documentElement.scrollWidth <= clientWidth` at
375px on every screen, `/tableau-de-bord` among them.

## Decision

**Edge arrows from `md` up only; the original below-message row, unchanged, stays the mobile
fallback.** `md` (768px) is the same breakpoint the shell's own burger trigger and sidebar already
treat as "mobile" in this app (`topbar.tsx`, `sidebar.tsx`), so this reuses a boundary a visitor
already crosses once per screen rather than adding a second one. Below it, nothing new is
`absolute`: the fallback is the mechanism this module shipped with, not a new one, which is what
keeps the 375px acceptance criterion satisfied without a fresh measurement pass. A swipe gesture
or overlaying the arrows on the illustration were both rejected (see below).

**The arrows anchor to a fixed pixel offset from the row's top edge (`top-[1.625rem]`), not to a
percentage of the row's own height.** The row's height is variable — a longer message body grows
it downward (`sm:min-h-20`'s own comment already names this) — so `top-1/2` re-centers on a moving
target and visibly relocates the arrows every time the message length changes between clicks,
which is the opposite of "fixed" this decision exists for. The row's _top_ edge never moves, only
its bottom does, so a fixed distance from the top (half the illustration's `h-20`, less half the
button's own `size-7`) stays put regardless of message length. The offset is also **not** built
from `top-10` plus a centering `-translate-y-1/2`: `Button` already carries
`active:not-aria-[haspopup]:translate-y-px` (`ui/button.tsx`) for its own pressed-state feedback,
and Tailwind's translate utilities all write the same `--tw-translate-y` custom property rather
than composing additively — whichever rule wins the cascade replaces the other outright, so a
centering transform and the button's own press transform fought over the same property and the
arrow visibly snapped on every click. Folding the half-button-height offset into the `top-*` value
itself needs no transform at all, so the two can never collide.

**The timer bar becomes a named CSS animation** (`news-progress-fill`, `globals.css`), restarted by
keying its element on the current message's id and paused in place with `animation-play-state`
rather than by unmounting it. This replaces a `requestAnimationFrame` loop that quantized its own
progress to 2% steps specifically to avoid a 60fps `setState` — the CSS animation removes the
re-render entirely, so the reason for quantizing disappears along with the loop. `useReducedMotion`
still gates the bar's **render**, not only its duration: `globals.css`'s blanket
`@media (prefers-reduced-motion: reduce)` rule now genuinely reaches this animation (it did not
reach the old RAF loop at all), but a fill that still completes, just near-instantly, would fire
`onAnimationEnd` immediately and spin the carousel through every message at frame rate — so the
JS gate stays, for a different reason than the one it was written for.

**The message row cross-fades**, using the same `tw-animate-css` `animate-in fade-in-0` utility
every Radix panel in this app already opens with, keyed on the message id so it replays on every
change, manual or automatic.

**Pause moves to the outer card**, covering the heading and the visibility toggle along with the
message row, so a keyboard user tabbing through any part of the module gets the same "does not
move under me" guarantee a mouse user hovering it does (item 1f's own wording).

## Rejected option

**A swipe gesture below `md`.** It would give a phone visitor the same reachable prev/next as
desktop, but it adds a new interaction pattern (and a new dependency, or a hand-rolled touch
handler, either way untested elsewhere in this app) to move five words of copy the dots already
navigate. The dots and the below-row arrows already work below `md`; a phone visitor loses nothing
they had, and the module gains none of the touch-target and accessibility work a real swipe
implementation would owe (an `aria-live` region, a distinguishable swipe-vs-scroll intent).

**Overlaying the arrows on the illustration.** Rejected because the illustration itself is hidden
below `sm` (`sm:block`, unchanged by this ADR) — there is nothing to overlay them on for exactly
the width range (`< sm`) where the constraint is tightest, so this option would need its own
narrower fallback anyway, at which point it is not simpler than keeping the one fallback the module
already has.

**Recomputing a remaining duration on pause/resume, instead of `animation-play-state`.** Rejected
on grounds of correctness margin, not effort: a duration recomputed from a JS-tracked percentage
can drift from what the browser actually painted, where `animation-play-state` freezes the
browser's own interpolated value and resumes from exactly it, with no JS in the loop at all.

## Reconsideration threshold

**The day this module needs a manual reachable action below `md` that the dots cannot express**
(anything beyond "go to message N") is the day the swipe-gesture option above is worth its own
implementation and its own accessibility pass, rather than being rejected against what this module
does today.

## Consequences

**Easy.** The RAF loop, its quantization step, and the three refs it needed (`startedAtRef`,
`lastEmittedRef`, plus the derived `progress` state) are gone; the browser now owns the animation
entirely, which is also strictly less code than what it replaces. `apps/web/e2e/motion.spec.ts`'s
existing pair (bar fills with no preference emulated; bar does not render at all under
`prefers-reduced-motion: reduce`) needed no assertion change, only a comment correction — the
contract it checks did not move.

**Not solved by this ADR**: a message body long enough to grow the row still reflows whatever sits
below the panel, exactly as before (`sm:min-h-20`'s own comment already named this as a partial fix,
not a full one) — this ADR touches the arrows, the timer and the transition, not that unrelated
gap.
