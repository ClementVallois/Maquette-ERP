import type { ReactElement } from 'react';

import { LABELS } from '@/lib/labels';

/**
 * Item 3, QA round 5 (ADR-0098): billing's dashboard used to render the same invoice-history
 * charts (`InvoiceHistoryChart`) the manager dashboard did — the reporter's own ask was to render
 * **nothing** here for now, made into a deliberate empty state rather than a blank gap in the
 * layout (BUILD-RULES: "empty, error and permission-denied states are part of the deliverable").
 * Not collapsible and not persisted: there is nothing behind it to hide.
 */
export function BillingChartsPlaceholder(): ReactElement {
  const labels = LABELS.dashboard.chartsUnavailable;

  return (
    <section className="flex flex-col gap-1 rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
      <h2 className="text-card-title">{labels.heading}</h2>
      <p className="text-sm text-muted-foreground">{labels.body}</p>
    </section>
  );
}
