import type { ReactElement } from 'react';

import type { Role } from '@/features/session/types';
import { LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';

// One entry per `Role`, so a role added to the type without an entry here is a compile error
// rather than a badge silently falling back to something. Colours are Tailwind utilities
// generated from `--color-role-*` in `styles/globals.css` — never a literal hex in this file
// (direction-visuelle.md §3's own rule).
const ROLE_BADGE_CLASSES: Record<Role, string> = {
  consultant: 'text-role-consultant-text bg-role-consultant-fill',
  manager: 'text-role-manager-text bg-role-manager-fill',
  billing: 'text-role-billing-text bg-role-billing-fill',
};

interface RoleBadgeProps {
  readonly role: Role;
  readonly className?: string;
}

/**
 * One colour per role (item 4, QA round 1) — ADR-0076 supersedes direction-visuelle.md §4.5's
 * "primary tint on the selector, neutral everywhere else". Every place this SPA names a role
 * (the persona selector's cards, the topbar identity block, a denied-state screen) renders it
 * through this one component, so the role→colour mapping lives in exactly one place — the same
 * reasoning `StatusBadge` already gives for the twelve status/tag/reason badges.
 */
export function RoleBadge({ role, className }: RoleBadgeProps): ReactElement {
  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center rounded-4xl px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        ROLE_BADGE_CLASSES[role],
        className,
      )}
    >
      {LABELS.roles[role]}
    </span>
  );
}
