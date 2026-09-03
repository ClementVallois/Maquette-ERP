import type { ReactElement } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LABELS } from '@/lib/labels';

/** The public-instance contract of ADR-0032, visible before and after persona selection. */
export function DemoNotice(): ReactElement {
  return (
    <Alert role="note" className="border-primary/20 bg-primary/5">
      <AlertTitle>{LABELS.demo.title}</AlertTitle>
      <AlertDescription>{LABELS.demo.body}</AlertDescription>
    </Alert>
  );
}
