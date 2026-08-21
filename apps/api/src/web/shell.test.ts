import { describe, expect, it } from 'vitest';

import type { Persona } from '../personas/catalogue.ts';

import { STYLESHEET } from './assets.ts';
import { LABELS } from './labels.ts';
import { html, renderToString } from './render/html.ts';
import { shell } from './shell.ts';

const alice: Persona = {
  key: 'consultant-paris',
  role: 'consultant',
  consultantId: '018f-alice',
  officeId: '018f-paris',
  officeName: 'Paris',
  displayName: 'Alice Martin',
};

const rendered = (persona: Persona | undefined): string =>
  renderToString(shell({ title: 'Titre', persona }, html`<p>corps</p>`));

describe('the shell', () => {
  it('declares the document language, which is what a screen reader reads it in', () => {
    expect(rendered(alice)).toContain('<html lang="fr">');
  });

  it('links the stylesheet by its content-hashed path', () => {
    expect(rendered(alice)).toContain(`href="${STYLESHEET.path}"`);
    expect(STYLESHEET.path).toMatch(/^\/assets\/style\.[0-9a-f]{12}\.css$/u);
  });

  it('names the persona in the page, not only in the README', () => {
    const page = rendered(alice);

    expect(page).toContain('Alice Martin');
    expect(page).toContain(LABELS.roles.consultant);
    expect(page).toContain('Paris');
  });

  it('says so when there is no persona, rather than rendering an empty bar', () => {
    expect(rendered(undefined)).toContain(LABELS.persona.none);
  });

  it('carries the notice that none of this is authentication', () => {
    expect(rendered(alice)).toContain(LABELS.footer.mockup);
  });

  it('offers a skip link before the header, for a keyboard user', () => {
    const page = rendered(alice);

    expect(page.indexOf('class="skip"')).toBeLessThan(page.indexOf('<header'));
    expect(page).toContain('id="contenu"');
  });

  it('navigates a persona only to the screens their role actually has', () => {
    // The rule `NAV_BY_ROLE` exists for: a link to a route that does not exist yet is a 404 the
    // reader meets before the feature does, and a link to a route the role may not reach is a 403
    // the reader meets instead of a screen. The consultant has the entry grid; the manager and
    // billing have the pré-facturier; nobody has the other's.
    const consultant = rendered(alice);
    expect(consultant).toContain(LABELS.cra.nav);
    expect(consultant).not.toContain(LABELS.preFacturier.nav);

    for (const role of ['manager', 'billing'] as const) {
      const page = rendered({ ...alice, role });
      expect(page).toContain(LABELS.preFacturier.nav);
      expect(page).not.toContain(LABELS.cra.nav);
    }

    // And with no persona there is no navigation at all, rather than a bar of links that all
    // refuse — the selector is the only thing to do at that point.
    expect(rendered(undefined)).not.toContain('navlist');
  });

  it('escapes a persona name, because a name is data', () => {
    const injected = renderToString(
      shell(
        { title: 'x', persona: { ...alice, displayName: '<script>alert(1)</script>' } },
        html``,
      ),
    );

    expect(injected).not.toContain('<script>alert(1)');
    expect(injected).toContain('&lt;script&gt;');
  });

  it('escapes the title into the head as well as the body', () => {
    const injected = renderToString(shell({ title: '</title><script>x', persona: alice }, html``));

    expect(injected).not.toContain('</title><script>');
  });
});
