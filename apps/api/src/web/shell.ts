import type { Role } from '@erp/platform';

import type { Persona } from '../personas/catalogue.ts';

import { STYLESHEET } from './assets.ts';
import { LABELS } from './labels.ts';
import { PATHS } from './paths.ts';
import { html, type Html } from './render/html.ts';

/**
 * The chrome every screen sits in: one document, one stylesheet, one navigation.
 *
 * The header is where a reader learns the two facts that make the rest of the mockup legible —
 * **which persona they are** and **that it is not a login**. Both are in the page rather than only
 * in the README, because the README is not open while the screen is.
 */

export interface Chrome {
  readonly title: string;
  readonly persona: Persona | undefined;
  /** Sections of the main navigation the current persona may reach. */
  readonly nav?: readonly NavItem[];
}

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly current?: boolean;
}

/**
 * What each role may navigate to. It is a table rather than a chain of conditionals for the reason
 * ADR-0023 gives about route declarations: a permission expressed as data can be read off the page,
 * and this one is the *navigational* echo of the route's `Access` — never its source. A link
 * missing here hides a screen; only the route's declaration refuses it.
 */
const NAV_BY_ROLE: Readonly<Record<Role, readonly NavItem[]>> = {
  // `PATHS.spaCra`, not `PATHS.consultantCra`: the latter is a registered route again since
  // Phase 9.3, but only for the POST that saves a month — the SPA reads and renders the grid at
  // `/cra`, and this chrome (used only by the two printables now) links a visitor there.
  consultant: [{ href: PATHS.spaCra, label: LABELS.cra.nav }],
  manager: [{ href: PATHS.preFacturier, label: LABELS.preFacturier.nav }],
  billing: [{ href: PATHS.preFacturier, label: LABELS.preFacturier.nav }],
};

export function navFor(persona: Persona | undefined): readonly NavItem[] {
  return persona === undefined ? [] : NAV_BY_ROLE[persona.role];
}

function roleTag(role: Role): Html {
  return html`<span class="tag role-${role}">${LABELS.roles[role]}</span>`;
}

function whoBar(persona: Persona | undefined): Html {
  if (persona === undefined) {
    return html`<p class="who">${LABELS.persona.none}</p>`;
  }

  return html`<div class="who">
    <span>${LABELS.persona.current} :</span>
    <strong>${persona.displayName}</strong>
    ${roleTag(persona.role)}
    <span>${persona.officeName}</span>
    <form class="inline no-print" method="post" action="${PATHS.clearPersona}">
      <button class="quiet" type="submit">${LABELS.persona.change}</button>
    </form>
  </div>`;
}

function navigation(items: readonly NavItem[]): Html | null {
  if (items.length === 0) return null;

  return html`<nav class="bar no-print" aria-label="${LABELS.nav.main}">
    <ul class="navlist">
      ${items.map(
        (item) =>
          // `aria-current="false"` rather than omitting the attribute: a hole between two
          // attributes lands in attribute-name position, which the renderer refuses outright
          // (ADR-0025), and "false" is the value the ARIA specification gives for "not current".
          html`<li>
            <a href="${item.href}" aria-current="${item.current === true ? 'page' : 'false'}"
              >${item.label}</a
            >
          </li>`,
      )}
    </ul>
  </nav>`;
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
          <div class="bar">
            <a class="wordmark" href="${PATHS.home}"
              >${LABELS.appName}<small>${LABELS.appTagline}</small></a
            >
            ${whoBar(chrome.persona)}
          </div>
          ${navigation(chrome.nav ?? navFor(chrome.persona))}
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
