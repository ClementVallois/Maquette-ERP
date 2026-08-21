import { describe, expect, it } from 'vitest';

import { STYLESHEET } from './assets.ts';
import { LABELS } from './labels.ts';
import { craGridPage } from './pages/cra-grid.ts';
import { preFacturierPage } from './pages/pre-facturier.ts';
import { html, renderToString } from './render/html.ts';
import { shell } from './shell.ts';

/**
 * The mechanical half of ADR-0061, asserted on rendered markup rather than promised in prose.
 *
 * Every claim here is one that regresses **silently**: a control loses its label, a table loses
 * its header scopes, the focus rule leaves the stylesheet, the skip link stops being first. None
 * of those breaks a page or a test that is about something else, which is exactly why they get
 * their own file.
 *
 * What this file deliberately does **not** assert is conformance. ADR-0061 says there is no RGAA
 * audit, no assistive-technology run and no published contrast ratio, and a test suite that
 * implied otherwise would be the claim the ADR exists to avoid.
 */

const persona = {
  key: 'consultant-paris',
  role: 'consultant',
  consultantId: 'a11y-alice',
  officeId: 'a11y-paris',
  officeName: 'Paris',
  displayName: 'Alice Martin',
} as const;

const manager = { ...persona, key: 'manager-paris', role: 'manager' } as const;

const grid = renderToString(
  craGridPage(
    {
      period: '2026-06',
      craId: 'a11y-cra',
      status: 'draft',
      days: [
        { date: '2026-06-01', nonWorkable: null, slots: [null, null] },
        { date: '2026-06-06', nonWorkable: 'weekend', slots: [null, null] },
      ],
      missions: [{ id: 'm-1', name: 'Audit DORA' }],
      flags: [],
      totals: [],
      editable: true,
      refusal: null,
    },
    persona,
  ),
);

const preFacturier = renderToString(
  preFacturierPage(
    {
      period: '2026-06',
      offeredPeriods: ['2026-06'],
      billable: [
        {
          invoiceId: 'inv-1',
          clientName: 'Banque Nord',
          status: 'draft',
          invoiceNumber: null,
          totalExcludingVatCents: 100_000,
          totalIncludingVatCents: 120_000,
        },
      ],
      cras: [
        {
          craId: 'cra-1',
          consultantId: 'c-1',
          consultantName: 'Alice Martin',
          status: 'submitted',
          recordedHalfDays: 40,
          blocking: [],
        },
        {
          craId: 'cra-2',
          consultantId: 'c-2',
          consultantName: 'Chloé Nguyen',
          status: 'validated',
          recordedHalfDays: 40,
          blocking: [],
        },
      ],
      lateHalfDays: 40,
      periodClosed: true,
      mayDecide: true,
    },
    manager,
  ),
);

describe('the document', () => {
  it('declares its language, so a screen reader pronounces it', () => {
    expect(grid).toContain('<html lang="fr">');
  });

  it('puts the skip link before the header and points it at the content', () => {
    const page = renderToString(shell({ title: 'x', persona }, html`<p>corps</p>`));

    expect(page.indexOf('class="skip"')).toBeLessThan(page.indexOf('<header'));
    expect(page).toContain('href="#contenu"');
    expect(page).toContain('id="contenu"');
  });

  it('keeps a visible focus ring in the stylesheet, never removed', () => {
    // The one accessibility property that lives in CSS rather than in markup, and the one most
    // often lost by a later rule. `outline: none` anywhere in this file would take full keyboard
    // navigation with it.
    expect(STYLESHEET.body).toContain(':focus-visible');
    expect(STYLESHEET.body).toMatch(/:focus-visible\s*\{[^}]*outline:\s*3px/u);
    expect(STYLESHEET.body).not.toMatch(/outline:\s*(none|0)\b/u);
  });
});

describe('form controls', () => {
  it('labels every select in the entry grid, including the ones a mouse user never reads', () => {
    const selects = [...grid.matchAll(/<select id="([^"]+)"/gu)].map(([, id]) => id ?? '');

    expect(selects.length).toBeGreaterThan(0);
    for (const id of selects) {
      expect(grid).toContain(`for="${id}"`);
    }
  });

  it('labels the period filter and the refusal reason', () => {
    expect(preFacturier).toContain('<label for="periode">');
    expect(preFacturier).toContain('for="refus-cra-1"');
    expect(preFacturier).toContain('id="refus-cra-1"');
  });

  it('gives every button a text label rather than an icon', () => {
    for (const [, text] of preFacturier.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gu)) {
      expect((text ?? '').replace(/<[^>]*>/gu, '').trim().length).toBeGreaterThan(0);
    }
  });
});

describe('tables', () => {
  it('gives every data table row and column headers with a scope', () => {
    for (const page of [grid, preFacturier]) {
      expect(page).toContain('<th scope="col">');
      expect(page).toContain('<th scope="row">');
      // Every `th` is scoped: an unscoped header in a table with both dimensions is announced
      // against the wrong axis, which is worse than no header at all.
      // `(?=[\s>])` so the lookahead does not read `<thead>` as an unscoped `<th>`.
      const unscoped = [...page.matchAll(/<th(?=[\s>])(?![^>]*scope=)[^>]*>/gu)];
      expect(unscoped).toStrictEqual([]);
    }
  });
});

describe('links', () => {
  it('disambiguates repeated link text with the row it belongs to', () => {
    // Two "Marge" links and two "Version imprimable" links on one page. A screen reader's list of
    // links is read out of table order, so the visible text alone would be four identical entries.
    expect(preFacturier).toContain(`${LABELS.preFacturier.reveal}<span class="sr-only">`);
    expect(preFacturier).toContain('Alice Martin');
    expect(preFacturier).toContain('Chloé Nguyen');
  });

  it('carries no title attribute, on any element', () => {
    // ADR-0061: `title` is not exposed on touch, not focusable and not announced consistently.
    // Nothing here may depend on it, and the way to keep that true is for none to exist.
    for (const page of [grid, preFacturier]) {
      expect(page).not.toMatch(/<[a-z][^>]*\stitle="/u);
    }
  });
});
