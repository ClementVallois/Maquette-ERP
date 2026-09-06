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

  it('renders exactly the crumb its caller passes, on the left of the title', () => {
    const page = renderToString(
      shell(
        {
          title: 'Titre',
          persona: alice,
          crumb: { href: '/pre-facturier', label: 'Pré-facturier' },
        },
        html`<p>corps</p>`,
      ),
    );

    expect(page).toContain('<a class="crumb" href="/pre-facturier">Pré-facturier</a');
    expect(page).toContain('Titre');
  });

  it('renders the title alone, with no crumb markup, when the caller passes none', () => {
    expect(rendered(alice)).not.toContain('class="crumb"');
  });

  // There is no second navigation row any more (front-end plan Phase 9.3): the SPA's own sidebar
  // is where a role's navigation lives, and this chrome — used only by the two printables — is
  // never the place a role-scoped link is chosen or refused.
  it('never renders a navigation list, for any persona or none', () => {
    for (const persona of [
      alice,
      { ...alice, role: 'manager' as const },
      { ...alice, role: 'billing' as const },
      undefined,
    ]) {
      const page = rendered(persona);
      expect(page).not.toContain('navlist');
      expect(page).not.toContain('<nav');
    }
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
