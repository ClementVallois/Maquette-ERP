import type { ReactElement } from 'react';

import { frenchDate } from '@/lib/format';

export interface TimelineItem {
  readonly key: string;
  readonly title: string;
  readonly at: string;
  readonly actorName?: string | null;
  readonly detail?: string;
}

export function BusinessTimeline({
  title,
  items,
}: {
  readonly title: string;
  readonly items: readonly TimelineItem[];
}): ReactElement | null {
  if (items.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
      <h3 className="text-card-title">{title}</h3>
      <ol className="mt-4 flex flex-col gap-0">
        {items.map((item, index) => (
          <li key={item.key} className="relative grid grid-cols-[1rem_1fr] gap-3 pb-5 last:pb-0">
            {index < items.length - 1 && (
              <span className="absolute top-4 bottom-0 left-[0.4375rem] w-px bg-border" />
            )}
            <span className="relative mt-1 size-3 rounded-full bg-primary ring-4 ring-background" />
            <div>
              <p className="font-medium text-foreground">{item.title}</p>
              <p className="text-sm text-muted-foreground">
                {frenchDate(item.at.slice(0, 10))}
                {item.actorName === undefined || item.actorName === null
                  ? ''
                  : ` · ${item.actorName}`}
              </p>
              {item.detail !== undefined && <p className="mt-1 text-sm">{item.detail}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
