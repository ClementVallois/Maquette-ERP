import type { Role } from '@erp/platform';

import type { Persona } from '../personas/catalogue.ts';

import { STYLESHEET } from './assets.ts';
import { LABELS } from './labels.ts';
import { PATHS } from './paths.ts';
import { html, type Html } from './render/html.ts';

/**
 * The chrome every screen sits in: one document, one stylesheet, one topbar.
 *
 * The header is where a reader learns the two facts that make the rest of the mockup legible —
 * **which persona they are** and **that it is not a login**. Both are in the page rather than only
 * in the README, because the README is not open while the screen is.
 *
 * Shape matches `apps/web`'s own topbar (`direction-visuelle.md` §6, `components/shell/topbar.tsx`)
 * rather than inventing a second one: a single 56px bar, the page's own crumb and title on the
 * left, the persona block on the right. There is no second navigation row here any more — this
 * chrome serves only the two printables (ADR-0055, ADR-0056); a role's navigation lives in the
 * SPA's own sidebar.
 */

export interface Chrome {
  readonly title: string;
  readonly persona: Persona | undefined;
  /**
   * The one parent crumb shown left of the title — this shell's answer to the SPA's `PageHeader`
   * breadcrumb, which is the SPA's own back affordance (there is no client-side history to go
   * back to here, no JavaScript runs). `undefined` on a page with no natural parent —
   * `problem-page.ts`'s refusals, which already carry their own "Revenir à l'accueil" link in the
   * body.
   */
  readonly crumb?: { readonly href: string; readonly label: string };
}

function roleTag(role: Role): Html {
  return html`<span class="tag role-${role}">${LABELS.roles[role]}</span>`;
}

/**
 * First initial + last initial, uppercased — byte-identical to the SPA's own `initialsOf`
 * (`components/shell/persona-block.tsx`), so the same display name reads the same abbreviation on
 * both sides of this application.
 */
function initialsOf(displayName: string): string {
  const words = displayName.trim().split(/\s+/u);
  const first = words[0]?.charAt(0) ?? '';
  const last = words.length > 1 ? (words[words.length - 1]?.charAt(0) ?? '') : '';

  return `${first}${last}`.toUpperCase();
}

/**
 * The topbar's right-hand identity block (direction-visuelle.md §6): an avatar carrying initials
 * — never a photo, there are no users here, only personas — the display name, then the role badge
 * and the office. `.tag.role-*` already carries ADR-0076's colours; this only restyles what sits
 * around it, not the tag itself.
 *
 * No dropdown: the printable shell runs no JavaScript. The link returns to the SPA's persona
 * selector, which owns session changes.
 */
function personaBlock(persona: Persona | undefined): Html {
  if (persona === undefined) {
    return html`<p class="persona-block">${LABELS.persona.none}</p>`;
  }

  return html`<div class="persona-block">
    <span class="avatar" aria-hidden="true">${initialsOf(persona.displayName)}</span>
    <span class="persona-id">
      <strong>${persona.displayName}</strong>
      <span class="persona-meta">${roleTag(persona.role)} · ${persona.officeName}</span>
    </span>
    <a class="quiet no-print" href="${PATHS.home}">${LABELS.persona.change}</a>
  </div>`;
}

/** The topbar's left-hand content: the page's own crumb (when it has a parent) and its title. */
function crumbAndTitle(chrome: Chrome): Html {
  if (chrome.crumb === undefined) {
    return html`<p class="topbar-title">${chrome.title}</p>`;
  }

  return html`<p class="topbar-title">
    <a class="crumb" href="${chrome.crumb.href}">${chrome.crumb.label}</a
    ><span class="crumb-sep" aria-hidden="true">›</span>${chrome.title}
  </p>`;
}

export function shell(chrome: Chrome, body: Html): Html {
  return html`<!doctype html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${chrome.title} — ${LABELS.appName}</title>
        <link rel="stylesheet" href="${STYLESHEET.path}" />
      </head>
      <body>
        <a class="skip" href="#contenu">${LABELS.nav.skipToContent}</a>
        <header class="site">
          <div class="topbar">${crumbAndTitle(chrome)} ${personaBlock(chrome.persona)}</div>
        </header>
        <main id="contenu">${body}</main>
        <footer class="site">
          <div>
            <p>${LABELS.footer.mockup}</p>
            <p>${LABELS.footer.source}</p>
          </div>
        </footer>
      </body>
    </html>`;
}
