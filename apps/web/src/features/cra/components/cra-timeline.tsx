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
        ...(item.detail === undefined ? {} : { detail: item.detail }),
      }))}
    />
  );
}
