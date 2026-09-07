import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Accent- and case-insensitive normalisation for client-side search matching (French names:
 * "Émilie" must match a query typed "emilie"). `NFD` decomposition separates a base letter
 * from its diacritic, which `\p{Diacritic}` then strips (a Unicode property escape, not a
 * hardcoded codepoint range: it needs the `u` flag this file's `.eslintrc`-inherited config
 * already allows on every other regex here). Moved here from
 * `features/affectations/components/assignment-screen.tsx`, its only caller before
 * `single-select-combobox.tsx` needed the same rule.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('fr-FR')
    .trim();
}
