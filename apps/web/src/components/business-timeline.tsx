import type { ReactElement } from 'react';

import { frenchDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface TimelineItem {
  readonly key: string;
  readonly title: string;
  readonly at: string;
  readonly actorName?: string | null;
  readonly detail?: string;
  /**
   * Item 30, QA round 3: a `bg-status-*-dot` utility class (`components/status-badge.tsx`'s own
   * token set) — the same colours a `StatusBadge` reads, so a validated Cra's bubble and a
   * validated Cra's badge are the same green everywhere in the app, never a colour invented for
   * this component alone. `undefined` (a caller that predates this field, if any) falls back to
   * `bg-primary`, the timeline's own original single colour.
   */
  readonly dotClassName?: string;
}

function TimelineText({ item }: { readonly item: TimelineItem }): ReactElement {
  return (
    <div>
      <p className="font-medium text-foreground">{item.title}</p>
      <p className="text-sm text-muted-foreground">
        {frenchDate(item.at.slice(0, 10))}
        {item.actorName === undefined || item.actorName === null ? '' : ` · ${item.actorName}`}
      </p>
      {item.detail !== undefined && <p className="mt-1 text-sm">{item.detail}</p>}
    </div>
  );
}

/**
 * Item 30, QA round 3: horizontal from `sm` up, to save the vertical space a long list of events
 * used to spend one full row each on — the original vertical layout stays below `sm` (a
 * `sm:hidden`/`hidden sm:flex` pair, the same "two trees, one hidden by breakpoint" idiom
 * `cra-grid-screen.tsx`'s own mobile/desktop matrices already use, rather than a single markup
 * tree trying to reflow itself both ways). `overflow-x-auto` on the horizontal row: this
 * component has no control over how many events a caller ever hands it, and a wide row scrolls
 * inside its own container rather than the page (the rule every wide element in this app follows).
 */
export function BusinessTimeline({
  title,
  caption,
  items,
}: {
  readonly title: string;
  /** F12: names what this component actually is — the milestones currently available, not a
   * complete history — rather than let the heading alone imply more than the data backs. */
  readonly caption?: string;
  readonly items: readonly TimelineItem[];
}): ReactElement | null {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
      <h3 className="text-card-title">{title}</h3>
      {caption !== undefined && <p className="text-xs text-muted-foreground">{caption}</p>}

      <ol className="mt-4 flex flex-col gap-0 sm:hidden">
        {items.map((item, index) => (
          <li key={item.key} className="relative grid grid-cols-[1rem_1fr] gap-3 pb-5 last:pb-0">
            {index < items.length - 1 && (
              <span
                aria-hidden="true"
                className="absolute top-4 bottom-0 left-[0.4375rem] w-px bg-border"
              />
            )}
            <span
              aria-hidden="true"
              className={cn(
                'relative mt-1 size-3 rounded-full ring-4 ring-background',
                item.dotClassName ?? 'bg-primary',
              )}
            />
            <TimelineText item={item} />
          </li>
        ))}
      </ol>

      {/* No `gap`/`px` on the `<ol>`/`<li>` here: the connector line below is sized from the
          `<li>`'s own width (a bubble-to-bubble reach, `left-1/2 w-full` on a `w-full` box), so
          adding horizontal breathing room on the `<li>` or a gap on the `<ol>` would move each
          bubble's centre further apart than the line's own span reaches — a visible break before
          every bubble. The padding needed so text doesn't touch between columns goes on the text
          wrapper below the connector row instead, where it cannot affect that math. */}
      <ol className="mt-4 hidden overflow-x-auto pb-1 sm:flex">
        {items.map((item, index) => (
          <li
            key={item.key}
            className="flex min-w-36 flex-1 flex-col items-center gap-2 text-center"
          >
            {/* The connecting line and the bubble share this one fixed-height, flex-centred box
                — both are positioned relative to its exact vertical centre (`top-1/2
                -translate-y-1/2` on the line, `items-center` on the box for the bubble), so the
                line lands on the bubble's centre regardless of the bubble's own size, rather than
                a magic-number offset the two could drift out of sync on. */}
            <div className="relative flex h-4 w-full items-center justify-center">
              {index < items.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute top-1/2 left-1/2 h-px w-full -translate-y-1/2 bg-border"
                />
              )}
              <span
                aria-hidden="true"
                className={cn(
                  'relative z-10 size-3 shrink-0 rounded-full ring-4 ring-background',
                  item.dotClassName ?? 'bg-primary',
                )}
              />
            </div>
            <div className="px-2">
              <TimelineText item={item} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
