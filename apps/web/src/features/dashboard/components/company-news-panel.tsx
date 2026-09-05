import { ChevronLeftIcon, ChevronRightIcon, PaperclipIcon } from 'lucide-react';
import type { AnimationEvent, ReactElement } from 'react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { VisibilityToggle } from '@/components/visibility-toggle';
import { frenchDate } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { readLocalPreference, writeLocalPreference } from '@/lib/local-preference';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { cn } from '@/lib/utils';

import { recentCompanyNews } from '../company-news';

const ROTATE_MS = 6000;

/** The `animation-name` the timer bar's fill div carries (`globals.css`) — checked in
 * `onAnimationEnd` so a future animation nested inside this element cannot be mistaken for the
 * fill completing (CSS animation-end events bubble). */
const PROGRESS_FILL_ANIMATION = 'news-progress-fill';

function hiddenKey(personaKey: string): string {
  return `erp:dashboard-company-news-hidden-at:${personaKey}`;
}

/**
 * Item 17, QA round 3: the company-news module — a small rotating carousel (up to five most
 * recent messages, `recentCompanyNews`), collapsible with the same `VisibilityToggle` item 23's
 * charts area uses.
 *
 * **Persisted visibility, not a plain boolean**: the stored value is the id of the newest message
 * at the moment the visitor hid the module, not `true`/`false`. On mount, the module starts
 * hidden only if that stored id still matches today's newest message — the instant a newer
 * message is authored, the stored id no longer matches and the module reopens on its own. A bare
 * boolean cannot express "hidden, but only until something new shows up", which is what "vie de
 * l'entreprise" content actually wants (item 17's own brief).
 *
 * **Auto-rotation, with a visible timer, pausable, and gone under reduced motion** (item 1, QA
 * round 5 replaced the original `requestAnimationFrame` loop): the timer bar is a plain CSS
 * animation (`news-progress-fill`, `globals.css`), restarted by keying its element on the current
 * message's id and paused in place with `animation-play-state` while `paused` is true — the
 * browser interpolates the fill and reports when it finishes (`onAnimationEnd`), so nothing here
 * re-renders on every frame. `autoRotateEnabled` (visible, more than one message, and
 * `useReducedMotion()` false) still gates whether the bar is rendered **at all**: leaving that to
 * `globals.css`'s own `@media (prefers-reduced-motion: reduce)` block (which collapses the
 * animation to near-zero duration rather than removing it) would fire `onAnimationEnd`
 * immediately and spin the carousel through every message at frame rate instead of leaving it
 * still. Manual navigation (the prev/next buttons, the dots) still works in every case, including
 * under reduced motion, since it never depends on the animation firing.
 *
 * **Pause covers the whole module, not just the message row**: `onMouseEnter`/`onMouseLeave`/
 * `onFocus`/`onBlur` sit on the outer card, so the heading and its visibility toggle pause it too
 * — a keyboard user tabbing through the module must not have the message change under them any
 * more than a mouse user hovering it should (item 1f, QA round 5).
 *
 * **Message-to-message transition**: the message row is keyed on the current message's id and
 * carries `tw-animate-css`'s `animate-in fade-in-0`, which plays once whenever React mounts a
 * fresh element for a new key — the same mechanism every Radix panel in this app already uses to
 * animate in, applied here without a Radix `data-state` to key off.
 *
 * **Mobile (item 1c, QA round 5)**: the previous/next arrows move to the module's left/right edges
 * only from `md` up (ADR-0096) — below it there is not enough width for side arrows plus text, so
 * the arrows stay in their original place, in a row under the message with the dots. Nothing here
 * is `absolute` below `md`, so the mobile layout carries no new horizontal-overflow risk.
 */
export function CompanyNewsPanel({ personaKey }: { readonly personaKey: string }): ReactElement {
  const messages = recentCompanyNews();
  const key = hiddenKey(personaKey);
  const newestId = messages[0]?.id ?? null;

  const [visible, setVisible] = useState(
    () => newestId === null || readLocalPreference(key) !== newestId,
  );
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useReducedMotion();

  const autoRotateEnabled = visible && !reducedMotion && messages.length > 1;

  function goTo(next: number): void {
    setIndex(((next % messages.length) + messages.length) % messages.length);
  }

  function handleFillAnimationEnd(event: AnimationEvent<HTMLDivElement>): void {
    if (event.animationName !== PROGRESS_FILL_ANIMATION) return;
    setIndex((current) => (current + 1) % messages.length);
  }

  const current = messages[index];
  if (current === undefined) return <></>;

  const labels = LABELS.dashboard.companyNews;

  return (
    <div
      className="rounded-xl bg-card p-5 shadow-card ring-1 ring-border"
      onMouseEnter={() => {
        setPaused(true);
      }}
      onMouseLeave={() => {
        setPaused(false);
      }}
      onFocus={() => {
        setPaused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-card-title">{labels.heading}</h2>
        <VisibilityToggle
          visible={visible}
          hideLabel={labels.hide}
          showLabel={labels.show}
          onToggle={() => {
            const next = !visible;
            setVisible(next);
            if (!next && newestId !== null) writeLocalPreference(key, newestId);
            else writeLocalPreference(key, '');
          }}
        />
      </div>

      {visible && (
        <div className="mt-3 flex flex-col gap-3">
          {/* `relative`: the anchor for the `md`-and-up edge arrows below — their position is
              fixed to this box, not to the text, which is the whole point of item 1b (QA round 5):
              before this, the arrows sat in a row after the message and moved down every time a
              longer body grew that row.

              The arrows themselves anchor to a **fixed pixel offset**, `top-[1.625rem]` (half of
              the illustration's fixed `h-20`, less half of the button's own `icon-sm` `size-7`),
              not `top-1/2`: this row's own height is variable (a longer body grows it downward,
              `sm:min-h-20`'s own comment says so), and centering on a *percentage* of a variable
              height would still move the arrows every time the message length changes — exactly
              what item 1b's own follow-up asked not to happen, because it forces a visitor to
              re-aim the pointer between clicks. A fixed offset from the row's top edge does not:
              that edge never moves, only the row's bottom does, so the arrows stay put whether the
              current message is one line or four.

              Deliberately **not** `-translate-y-1/2` to reach that same point from `top-10`: this
              `Button` already carries `active:not-aria-[haspopup]:translate-y-px`
              (`ui/button.tsx`) for its own pressed-state feedback, and Tailwind's translate
              utilities all write the same `--tw-translate-y` variable — whichever one wins the
              cascade replaces the other outright rather than composing with it, so a centering
              `-translate-y-1/2` snapped to the button's own 1px press offset the instant a visitor
              clicked, a sudden and highly visible jump. Baking the half-button-height offset into
              the `top-*` value itself needs no transform at all, so the two never collide. */}
          <div className="relative">
            {messages.length > 1 && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={labels.previous}
                  className="absolute top-[1.625rem] left-0 z-10 hidden md:flex"
                  onClick={() => {
                    goTo(index - 1);
                  }}
                >
                  <ChevronLeftIcon aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={labels.next}
                  className="absolute top-[1.625rem] right-0 z-10 hidden md:flex"
                  onClick={() => {
                    goTo(index + 1);
                  }}
                >
                  <ChevronRightIcon aria-hidden="true" />
                </Button>
              </>
            )}

            {/* `sm:min-h-20`: matches the illustration's own `h-20` so switching from an
                illustrated message to a short text-only one (or back) doesn't collapse/grow the
                row — the rotation would otherwise reflow whatever sits below this panel on every
                advance, real or automatic. Not a full fix (a very long body still grows the row;
                measuring every message's true height up front would be needed for that), but it
                removes the worst, most frequent case. `md:px-9` clears the two edge arrows above
                (`size-7` plus their own inset) only when they are actually rendered. Keyed on the
                message id so `animate-in fade-in-0` (the cross-fade, item 1e) replays on every
                change, manual or automatic. */}
            <div
              key={current.id}
              className={cn(
                'animate-in fade-in-0 flex items-start gap-3 duration-200 sm:min-h-20',
                messages.length > 1 && 'md:px-9',
              )}
            >
              {current.imageSrc !== null && (
                <img
                  src={current.imageSrc}
                  alt=""
                  className="hidden h-20 w-28 shrink-0 rounded-lg object-cover sm:block"
                />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <h3 className="text-sm font-semibold text-foreground">{current.title}</h3>
                <p className="text-xs text-muted-foreground">
                  {current.author} · {frenchDate(current.publishedAt)}
                </p>
                <p className="text-sm text-foreground">{current.body}</p>
                {current.attachmentName !== null && (
                  // A `<span>`, not an `<a>`: see `company-news.ts`'s own field comment. Nothing
                  // serves a document here, and a link that answers the SPA shell with 200 reboots
                  // the app on its not-found screen instead of failing visibly.
                  <span className="mt-1 inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground">
                    <PaperclipIcon aria-hidden="true" className="size-3.5 shrink-0" />
                    {current.attachmentName}
                    <span className="text-xs">{labels.attachmentNotProvided}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {messages.length > 1 && (
            // Below `md`: the original row, prev/dots/next together (item 1c's argued fallback).
            // From `md` up: the prev/next buttons above take over, so only the dots remain, and
            // `md:justify-center` re-centres them now that they are the row's only content.
            <div className="flex items-center justify-between gap-2 md:justify-center">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={labels.previous}
                className="md:hidden"
                onClick={() => {
                  goTo(index - 1);
                }}
              >
                <ChevronLeftIcon aria-hidden="true" />
              </Button>

              <div className="flex items-center">
                {messages.map((message, dotIndex) => (
                  // `size-6` (24px): the visible dot stays `size-1.5`, but the button itself — the
                  // actual touch target — does not shrink to match it. `target-size` (WCAG 2.2) is
                  // `enabled: false` in this repository's axe-core version, so the bare `.analyze()`
                  // call `assertAccessible` makes would not have caught a 6px target. Sized for the
                  // rule rather than for the gate that does not yet run it.
                  <button
                    key={message.id}
                    type="button"
                    aria-label={labels.goToMessage
                      .replace('{index}', String(dotIndex + 1))
                      .replace('{total}', String(messages.length))}
                    aria-current={dotIndex === index}
                    onClick={() => {
                      goTo(dotIndex);
                    }}
                    className="flex size-6 items-center justify-center"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'size-1.5 rounded-full transition-colors',
                        dotIndex === index ? 'bg-primary' : 'bg-border',
                      )}
                    />
                  </button>
                ))}
              </div>

              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={labels.next}
                className="md:hidden"
                onClick={() => {
                  goTo(index + 1);
                }}
              >
                <ChevronRightIcon aria-hidden="true" />
              </Button>
            </div>
          )}

          {/* The visible timer — a progress bar, not a ring. `news-progress-fill` (`globals.css`)
              drives `width` from 0% to 100% over `ROTATE_MS`, linearly; `animationPlayState`
              freezes it in place on pause rather than removing it, so a visitor who hovers away
              sees exactly where the timer stood, not a blank track. Keyed on the message id so a
              manual jump restarts the fill at 0 the same way the message row above does. */}
          {autoRotateEnabled && (
            <div
              data-slot="news-progress"
              className="h-0.5 w-full overflow-hidden rounded-full bg-border"
              aria-hidden="true"
            >
              <div
                key={current.id}
                className="h-full rounded-full bg-primary"
                style={{
                  animationName: PROGRESS_FILL_ANIMATION,
                  animationDuration: `${String(ROTATE_MS)}ms`,
                  animationTimingFunction: 'linear',
                  animationFillMode: 'forwards',
                  animationPlayState: paused ? 'paused' : 'running',
                }}
                onAnimationEnd={handleFillAnimationEnd}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
