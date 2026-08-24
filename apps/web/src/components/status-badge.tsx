import type { ReactElement } from 'react';

import { LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

/**
 * Every real status, tag and reason this application ever renders as a coloured-dot badge
 * (direction-visuelle.md §4 — the four Cra statuses, the "en retard" tag, the three invoice
 * statuses, the four declined-day reasons). Not a generic "status" prop that accepts any string:
 * a badge only ever means one of these twelve things.
 *
 * Labels come from `src/lib/labels.ts` (frontend-plan.md task 3.3, "migrés en Phase 3" per Phase
 * 2's own task 2.4). They were hard-coded here provisionally until this phase — kept in this one
 * map, never scattered at call sites, which is what made the migration a one-file edit and not a
 * search-and-replace across every screen that renders a badge.
 */
export type StatusBadgeVariant =
  | 'cra-draft'
  | 'cra-submitted'
  | 'cra-validated'
  | 'cra-refused'
  // "En retard" (ADR-0054) is a tag that rides alongside a Cra status, not a fifth status of its
  // own — render it as a second, separate StatusBadge next to the real one, never in place of it.
  | 'cra-late'
  | 'invoice-draft'
  | 'invoice-issued'
  | 'invoice-cancelled'
  | 'declined-not-regie'
  | 'declined-unknown-mission'
  | 'declined-no-agreed-rate'
  | 'declined-unknown-client';

interface StatusBadgeInfo {
  readonly label: string;
  readonly text: string;
  readonly fill: string;
  readonly dot: string;
}

// Each of `text`/`fill`/`dot` is a Tailwind utility generated from a `--color-status-*` entry in
// styles/globals.css, which is itself an alias onto one of five hue "tones" — the deliberate
// reuses direction-visuelle.md §4.2/§4.3 name (invoice `draft` = Cra `draft`; `cancelledByCreditNote`
// reuses `refused`'s red) are already encoded there, once. Nothing here is a literal colour.
const STATUS_BADGE_INFO: Record<StatusBadgeVariant, StatusBadgeInfo> = {
  'cra-draft': {
    label: LABELS.cra.statuses.draft,
    text: 'text-status-cra-draft-text',
    fill: 'bg-status-cra-draft-fill',
    dot: 'bg-status-cra-draft-dot',
  },
  'cra-submitted': {
    label: LABELS.cra.statuses.submitted,
    text: 'text-status-cra-submitted-text',
    fill: 'bg-status-cra-submitted-fill',
    dot: 'bg-status-cra-submitted-dot',
  },
  'cra-validated': {
    label: LABELS.cra.statuses.validated,
    text: 'text-status-cra-validated-text',
    fill: 'bg-status-cra-validated-fill',
    dot: 'bg-status-cra-validated-dot',
  },
  'cra-refused': {
    label: LABELS.cra.statuses.refused,
    text: 'text-status-cra-refused-text',
    fill: 'bg-status-cra-refused-fill',
    dot: 'bg-status-cra-refused-dot',
  },
  'cra-late': {
    // "En retard" (ADR-0054) lives in `preFacturier`, the one screen it was written for — there
    // is no separate `cra.tags.late` entry, and this reaches across the section rather than
    // duplicate the string.
    label: LABELS.preFacturier.lateTag,
    text: 'text-status-late-text',
    fill: 'bg-status-late-fill',
    dot: 'bg-status-late-dot',
  },
  'invoice-draft': {
    label: LABELS.preFacturier.invoiceStatuses.draft,
    text: 'text-status-invoice-draft-text',
    fill: 'bg-status-invoice-draft-fill',
    dot: 'bg-status-invoice-draft-dot',
  },
  'invoice-issued': {
    label: LABELS.preFacturier.invoiceStatuses.issued,
    text: 'text-status-invoice-issued-text',
    fill: 'bg-status-invoice-issued-fill',
    dot: 'bg-status-invoice-issued-dot',
  },
  'invoice-cancelled': {
    label: LABELS.preFacturier.invoiceStatuses.cancelledByCreditNote,
    text: 'text-status-invoice-cancelled-text',
    fill: 'bg-status-invoice-cancelled-fill',
    dot: 'bg-status-invoice-cancelled-dot',
  },
  'declined-not-regie': {
    label: LABELS.preFacturier.declineReasons.notRegie,
    text: 'text-status-declined-not-regie-text',
    fill: 'bg-status-declined-not-regie-fill',
    dot: 'bg-status-declined-not-regie-dot',
  },
  'declined-unknown-mission': {
    label: LABELS.preFacturier.declineReasons.unknownMission,
    text: 'text-status-declined-unknown-mission-text',
    fill: 'bg-status-declined-unknown-mission-fill',
    dot: 'bg-status-declined-unknown-mission-dot',
  },
  'declined-no-agreed-rate': {
    label: LABELS.preFacturier.declineReasons.noAgreedRate,
    text: 'text-status-declined-no-agreed-rate-text',
    fill: 'bg-status-declined-no-agreed-rate-fill',
    dot: 'bg-status-declined-no-agreed-rate-dot',
  },
  'declined-unknown-client': {
    label: LABELS.preFacturier.declineReasons.unknownClient,
    text: 'text-status-declined-unknown-client-text',
    fill: 'bg-status-declined-unknown-client-fill',
    dot: 'bg-status-declined-unknown-client-dot',
  },
};

interface StatusBadgeProps {
  readonly variant: StatusBadgeVariant;
  readonly className?: string;
}

/**
 * Dot + label, always both — colour never carries meaning alone (direction-visuelle.md §9), so
 * this badge stays legible with the hue removed, e.g. in a printed screenshot.
 */
export function StatusBadge({ variant, className }: StatusBadgeProps): ReactElement {
  const info = STATUS_BADGE_INFO[variant];

  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center gap-1.5 rounded-4xl px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        info.text,
        info.fill,
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-1.5 shrink-0 rounded-full', info.dot)} />
      {info.label}
    </span>
  );
}
