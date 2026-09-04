import type { ReactElement } from 'react';

import { BusinessTimeline } from '@/components/business-timeline';
import { LABELS } from '@/lib/labels';

import type { CraGridResponse } from '../types';

export function CraTimeline({ timeline }: Pick<CraGridResponse, 'timeline'>): ReactElement | null {
  return (
    <BusinessTimeline
      title={LABELS.timeline.heading}
      items={timeline.map((item, index) => ({
        key: `${item.kind}-${item.at}-${String(index)}`,
        title: LABELS.timeline[item.kind],
        at: item.at,
        actorName: item.actorName,
        ...(item.detail === undefined
          ? {}
          : {
              // Item 31, QA round 3: `detail` is only ever set for a `refused` entry (the
              // manager's free-text reason) — `api.ts`'s `craTimeline` never populates it for any
              // other kind — so this prefix is unconditionally correct here.
              detail: `${LABELS.cra.refusalReasonPrefix}${item.detail}`,
            }),
      }))}
    />
  );
}
