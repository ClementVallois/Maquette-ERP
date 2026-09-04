import { ChevronLeftIcon, ChevronRightIcon, PaperclipIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { VisibilityToggle } from '@/components/visibility-toggle';
import { frenchDate } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { readLocalPreference, writeLocalPreference } from '@/lib/local-preference';
import { useReducedMotion } from '@/lib/use-reduced-motion';
import { cn } from '@/lib/utils';

import { recentCompanyNews } from '../company-news';

const ROTATE_MS = 6000;

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
 * **Auto-rotation, with a visible timer, pausable, and gone under reduced motion**: a
 * `requestAnimationFrame` loop drives a 0→1 progress value over `ROTATE_MS`, rendered as a bar
 * under the current message; reaching 1 advances to the next message and resets it. The loop
 * itself is never started when `useReducedMotion()` is true or the panel is hidden or paused
 * (hover/focus) — manual navigation (the prev/next buttons, the dots) still works in every case.
 */
export function CompanyNewsPanel({ personaKey }: { readonly personaKey: string }): ReactElement {
  const messages = recentCompanyNews();
  const key = hiddenKey(personaKey);
  const newestId = messages[0]?.id ?? null;

  const [visible, setVisible] = useState(
    () => newestId === null || readLocalPreference(key) !== newestId,
  );
  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const startedAtRef = useRef(0);
  // The RAF loop below still ticks every frame (cheap: two subtractions, no state write), but
  // only calls `setProgress` when the rounded value actually changed — otherwise this panel, on
  // the app's own landing page, would re-render the whole dashboard tree at 60fps forever, which
  // makes screenshots and layout-stability checks non-deterministic for no visible benefit (the
  // step below is imperceptible at a 6s rotation).
  const lastEmittedRef = useRef(0);
  const PROGRESS_STEP = 0.02;
  const reducedMotion = useReducedMotion();

  const rotating = visible && !paused && !reducedMotion && messages.length > 1;

  useEffect(() => {
    if (!rotating) return;
    startedAtRef.current = performance.now() - progress * ROTATE_MS;
    let frame: number;
    const tick = (now: number): void => {
      const elapsed = now - startedAtRef.current;
      const fraction = Math.min(1, elapsed / ROTATE_MS);
      // `Math.floor`, not `Math.round`: repo-wide ban (ADR-0035, money-motivated but written
      // without a scope carve-out) — quantizing down rather than to nearest is just as fine for a
      // progress bar that only ever fills forward.
      const quantized = Math.floor(fraction / PROGRESS_STEP) * PROGRESS_STEP;
      if (quantized !== lastEmittedRef.current) {
        lastEmittedRef.current = quantized;
        setProgress(quantized);
      }
      if (fraction >= 1) {
        setIndex((current) => (current + 1) % messages.length);
        startedAtRef.current = now;
        lastEmittedRef.current = 0;
        setProgress(0);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
    };
    // `progress` deliberately excluded: read once at effect start (to resume from where a pause
    // left off), not a dependency the effect should restart for on every frame it itself sets.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotating, messages.length]);

  function goTo(next: number): void {
    setIndex(((next % messages.length) + messages.length) % messages.length);
    lastEmittedRef.current = 0;
    setProgress(0);
    // Without this, a manual jump (a dot, prev/next) leaves `startedAtRef` at its old value —
    // the RAF loop's effect only restarts on `[rotating, messages.length]`, neither of which a
    // manual jump changes, so the very next frame would compute `elapsed` against the stale
    // start time and could skip straight past the message just chosen.
    startedAtRef.current = performance.now();
  }

  const current = messages[index];
  if (current === undefined) return <></>;

  const labels = LABELS.dashboard.companyNews;

  return (
    <div className="rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
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
        <div
          className="mt-3 flex flex-col gap-3"
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
          {/* `sm:min-h-20`: matches the illustration's own `h-20` so switching from an
              illustrated message to a short text-only one (or back) doesn't collapse/grow the
              row — the rotation would otherwise reflow whatever sits below this panel on every
              advance, real or automatic. Not a full fix (a very long body still grows the row;
              measuring every message's true height up front would be needed for that), but it
              removes the worst, most frequent case. */}
          <div className="flex items-start gap-3 sm:min-h-20">
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

          {messages.length > 1 && (
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={labels.previous}
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
                onClick={() => {
                  goTo(index + 1);
                }}
              >
                <ChevronRightIcon aria-hidden="true" />
              </Button>
            </div>
          )}

          {/* The visible timer — a progress bar, not a ring: `progress` (0→1) drives `width`
              directly from the RAF loop above, no CSS animation to fight `prefers-reduced-motion`
              with (the loop itself never starts under that setting, so this simply stays at 0). */}
          {rotating && (
            <div
              data-slot="news-progress"
              className="h-0.5 w-full overflow-hidden rounded-full bg-border"
              aria-hidden="true"
            >
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${String(progress * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
