import type { ReactElement } from 'react';

import { BusinessTimeline } from '@/components/business-timeline';
import { LABELS } from '@/lib/labels';

import type { CraGridResponse } from '../types';

/** Item 30, QA round 3: the same dot colours `StatusBadge` reads for the Cra status itself. */
const KIND_DOT_CLASS: Record<CraGridResponse['timeline'][number]['kind'], string> = {
  submitted: 'bg-status-cra-submitted-dot',
  refused: 'bg-status-cra-refused-dot',
  validated: 'bg-status-cra-validated-dot',
};

export function CraTimeline({ timeline }: Pick<CraGridResponse, 'timeline'>): ReactElement | null {
  return (
    <BusinessTimeline
      title={LABELS.timeline.heading}
      items={timeline.map((item, index) => ({
        key: `${item.kind}-${item.at}-${String(index)}`,
        title: LABELS.timeline[item.kind],
        at: item.at,
        actorName: item.actorName,
        dotClassName: KIND_DOT_CLASS[item.kind],
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
