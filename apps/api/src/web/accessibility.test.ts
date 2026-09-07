import {
  billedParty,
  client,
  Invoice,
  legalEntity,
  legalMentions,
  paymentTerms,
  regieLine,
} from '@erp/billing';
import { period } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { STYLESHEET } from './assets.ts';
import { craPrintPage } from './pages/cra-print.ts';
import { invoicePage } from './pages/invoice.ts';
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
 *
 * Recentred on the two printables in front-end plan Phase 9.3: `craGridPage` and
 * `preFacturierPage`, this file's original subjects, are gone with the interactive screens they
 * rendered. `apps/web`'s own accessibility coverage (`e2e/axe.spec.ts`, task 9.6's exit gate) is
 * where the SPA's controls — the entry grid's `<select>`s, the pré-facturier's filter and refusal
 * reason — are asserted now; this file keeps only what the two documents that stay server-rendered
 * still carry.
 */

const persona = {
  key: 'consultant-paris',
  role: 'consultant',
  consultantId: 'a11y-alice',
  officeId: 'a11y-paris',
  officeName: 'Paris',
  displayName: 'Alice Martin',
} as const;

const craPrint = renderToString(
  craPrintPage(
    {
      craId: 'a11y-cra',
      consultantName: 'Alice Martin',
      officeName: 'Paris',
      period: '2026-06',
      status: 'validated',
      lines: [{ day: '2026-06-01', dayType: 'worked', missionId: 'm-1', quarterDays: 4 }],
      flags: [],
      validatedBy: 'Bruno Leroy',
      validatedAt: '2026-07-01',
      missionNames: new Map([['m-1', 'Audit DORA']]),
    },
    persona,
  ),
);

/**
 * A real `Invoice`, built the same way `packages/billing`'s own domain tests do (its
 * `testing/march-2026.ts` fixture is package-internal, not part of the public index `apps/api`
 * may import — ADR-0015 — so the values are copied rather than shared) rather than a hand-typed
 * object literal: this is the one page in this file whose view model wraps a domain class with a
 * private constructor, and only the class's own factory produces one that type-checks.
 */
const a11yClient = client({
  id: 'a11y-client',
  name: 'Banque Nord SA',
  siren: '552100554',
  territoriality: 'metropolitanFrance',
  billingAddress: {
    line1: '12 rue de la Boétie',
    line2: null,
    postalCode: '75008',
    city: 'Paris',
    country: 'FR',
  },
});

const invoice = renderToString(
  invoicePage(
    {
      invoice: Invoice.draft({
        id: 'a11y-invoice',
        officeId: 'a11y-office',
        seller: legalEntity({
          id: 'entity-fr',
          name: 'Sécurité & Conseil',
          legalForm: 'SAS',
          shareCapitalCents: 15_000_000,
          siren: '493296529',
          intraCommunityVatNumber: 'FR23493296529',
          rcsRegistration: 'RCS Paris 493 296 529',
          address: a11yClient.billingAddress,
          numberPrefix: 'SEC',
        }),
        billedTo: billedParty(a11yClient),
        supplyPeriod: period(2026, 6),
        lines: [
          regieLine({
            designation: 'Audit DORA — juin 2026',
            missionId: 'a11y-mission',
            craId: 'a11y-cra',
            period: '2026-06',
            quarterDays: 80,
            tjmCents: 50_000,
            vat: { kind: 'taxable', basisPoints: 2000 },
          }),
        ],
        terms: paymentTerms({ kind: 'net', days: 30 }),
        mentions: legalMentions({
          latePaymentBasisPoints: 3000,
          recoveryIndemnityCents: 4_000,
          earlyPaymentDiscount: { kind: 'none' },
          operationCategory: 'services',
          vatOnDebitsOption: true,
        }),
        validatedBy: ['a11y-bruno'],
      }),
      dueDate: null,
      issuanceKey: 'a11y-key',
    },
    { ...persona, key: 'billing-paris', role: 'billing' },
  ),
);

describe('the document', () => {
  it('declares its language, so a screen reader pronounces it', () => {
    expect(craPrint).toContain('<html lang="fr">');
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

/**
 * Content of the `{ … }` block that starts right after `openIndex` (a position just past an
 * opening `{`, `depth` already at 1) — brace-counting rather than a regex, because a regex with no
 * recursion cannot find the *matching* `}` of a block that nests another (`@media print { … }`
 * nests each selector's own `{ … }`).
 */
function blockAfter(css: string, openIndex: number): string {
  let depth = 1;
  let index = openIndex;

  while (depth > 0 && index < css.length) {
    if (css[index] === '{') depth += 1;
    else if (css[index] === '}') depth -= 1;
    index += 1;
  }

  return css.slice(openIndex, index - 1);
}

describe('the print stylesheet', () => {
  it('gives .no-print !important, so no element+class rule elsewhere can out-specificity it', () => {
    // Regression for the bug the user reported live: `p.actions { display: flex }` had
    // specificity (0,1,1), which beats a bare `.no-print` (0,1,0) regardless of source order, so
    // `<p class="actions no-print">` printed anyway. That markup and its rule are both gone now,
    // which is exactly why this test is not written against them: `!important` is the fix that
    // holds for every future `.no-print` user — CSS's cascade puts `!important` ahead of
    // specificity, so this is the one form of the rule that cannot lose to an element+class rule
    // this sheet has not been written yet.
    const printBlocks = [...STYLESHEET.body.matchAll(/@media print\s*\{/gu)].map((match) =>
      blockAfter(STYLESHEET.body, match.index + match[0].length),
    );

    expect(printBlocks.length).toBeGreaterThan(0);

    const winsOverAnyElementClassRule = printBlocks.some((block) =>
      /\.no-print\s*\{[^}]*display:\s*none\s*!important/u.test(block),
    );

    expect(winsOverAnyElementClassRule).toBe(true);
  });
});

describe('the topbar crumb', () => {
  it("points the printable Cra's crumb at the SPA's own /cra/:period, never the POST-only /consultant/cra", () => {
    // Front-end plan Phase 9.3: `PATHS.consultantCra` ('/consultant/cra') stays a registered
    // route for the grid's save/submit POST, but no GET answers it any more — the SPA renders the
    // grid at `/cra/:period`, and this crumb (the printable's only back affordance, replacing the
    // shell's old role-scoped nav) has to point there instead.
    expect(craPrint).toContain('<a class="crumb" href="/cra/2026-06">');
    expect(craPrint).not.toContain('/consultant/cra');
  });

  it("points the invoice's crumb at the pré-facturier, carrying the invoice's own supply period", () => {
    expect(invoice).toContain('<a class="crumb" href="/pre-facturier?period=2026-06">');
  });
});

describe('controls', () => {
  it('gives every button a text label rather than an icon', () => {
    // The invoice's issuance form (billing only) and the shell's own "change persona" button —
    // the two buttons either printable can render.
    for (const page of [craPrint, invoice]) {
      for (const [, text] of page.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gu)) {
        expect((text ?? '').replace(/<[^>]*>/gu, '').trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe('tables', () => {
  it('gives every data table row and column headers with a scope', () => {
    for (const page of [craPrint, invoice]) {
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

describe('the document, once more', () => {
  it('carries no title attribute, on any element', () => {
    // ADR-0061: `title` is not exposed on touch, not focusable and not announced consistently.
    // Nothing here may depend on it, and the way to keep that true is for none to exist.
    for (const page of [craPrint, invoice]) {
      expect(page).not.toMatch(/<[a-z][^>]*\stitle="/u);
    }
  });
});
