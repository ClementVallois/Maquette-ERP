import { expect, test, type Page } from '@playwright/test';

/**
 * The plural SPA route and the singular SSR printable that shares its prefix.
 *
 * `docs/frontend-plan.md` Annexe C.9 states the rule as "`/factures/$id` (SPA, pluriel) ≠
 * `/facture/:id` (SSR, singulier) — jamais de collision", and read as "the two never share a
 * URL" it is true and useless: the collision is not an equal URL, it is a **prefix match**.
 * `'/factures'.startsWith('/facture')` is `true`, so any dispatcher that decides "is this the
 * printable route?" with a bare prefix test hands the SPA's own invoice list to the API. That
 * happened once already, in `apps/web/vite.config.ts`'s dev proxy (found building task 8.1, fixed
 * by giving the two printable contexts a trailing slash), and the same decision is written a
 * second time in `docs/frontend-plan.md` §9.1: "tout `GET` qui n'est pas `/api/*`,
 * `/facture/:id`, `/releve/:id`, `/healthz`, `/readyz` … renvoie `index.html`". Implemented as a
 * `startsWith` list — the obvious way to read that sentence — production serves the printable
 * route, or a 404, for `/factures`.
 *
 * These are the assertions that catch it in **either** topology, which is the point of writing
 * them here rather than as a note in the plan. Today they run against Vite, whose own proxy makes
 * the decision; from task 9.6 the same suite runs against `apps/web/dist` served by Fastify,
 * which makes it again, in different code. Nothing else spans both.
 *
 * Every navigation below is a **full** one (`page.goto`, i.e. a typed URL, a refresh, a pasted
 * link) — never a client-side `<Link>`, which stays inside the SPA and so never reaches the
 * dispatcher this file is about.
 *
 * Checked against the SPA's pinned route list (`docs/frontend-plan.md`, "Routes SPA épinglées")
 * before writing: `/factures` and `/factures/$id` against `/facture` are the **only** collision
 * family. No pinned route begins with `/releve`, `/api`, `/healthz` or `/readyz` — and
 * `/factures/x` does not begin with `/facture/` either (index 8 is `s`, not `/`), which is why
 * the trailing slash is a complete fix rather than a fix for the bare case only.
 */

/** Same shape as `shell.spec.ts`'s own guard error: the repository forbids a bare `new Error`,
 * and "the seed is not what this spec assumes" is a precondition failure, not a routing result. */
class SeedPreconditionError extends Error {}

/** Same reasoning as `SeedPreconditionError` above, for a precondition about the built markup
 * rather than the seed — index.html not declaring a favicon at all, which item 5's own fix means
 * to make permanently untrue. */
class MarkupAssumptionError extends Error {}

/**
 * What tells the two documents apart, at the document level rather than by anything they render.
 *
 * `apps/web/index.html` is an empty `<div id="root">` plus the module script — that *is* the SPA,
 * and it is the byte-for-byte thing task 9.1's fallback has to return. The server-rendered shell
 * (`apps/api/src/web/shell.ts`) has no `#root` and wraps its body in `<main id="contenu">`.
 * Asserting on both, in both directions, is what makes each test below say "this document, not
 * the other one" rather than "some page loaded". Note in passing that the printable pages *do*
 * render a `nav[aria-label="Navigation principale"]` of their own (`no-print`), so the sidebar is
 * not a discriminator — checked live, after assuming otherwise.
 */
const SPA_ROOT = '#root';
const SSR_MAIN = 'main#contenu';

async function choosePersona(page: Page, personaKey: string): Promise<void> {
  await page.goto('/');
  await page.locator(`[data-persona-key="${personaKey}"] button`).click();
  await page.waitForURL('/tableau-de-bord');
}

/** One invoice id from the API itself, rather than a literal: the seed's ids are generated, and a
 * hard-coded one would make this spec fail for a reason that has nothing to do with routing. */
async function anyInvoiceId(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/invoices?limit=50');
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { invoices: { id: string }[] };
  const [first] = body.invoices;
  if (first === undefined) {
    throw new SeedPreconditionError('The seed holds no invoice. Run `pnpm run db:reset`.');
  }

  return first.id;
}

async function anyCraId(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/cras?limit=50');
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { cras: { id: string }[] };
  const [first] = body.cras;
  if (first === undefined) {
    throw new SeedPreconditionError('The seed holds no Cra. Run `pnpm run db:reset`.');
  }

  return first.id;
}

/** One viewport throughout: which document a URL resolves to has nothing to do with viewport
 * width, and each test here is a full page load against the single dev stack — the row of
 * 25/08 in `docs/open-questions.md` records what running both projects at once costs it. */
test.describe('the /facture prefix does not capture the SPA’s plural routes', () => {
  test('a full navigation to /factures lands on the SPA invoice list', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the dispatcher does not know the viewport');

    await choosePersona(page, 'billing-paris');

    const response = await page.goto('/factures');

    // The document itself, before anything about what it renders: the printable route answers
    // `text/html` too, so the status alone proves nothing — but a `problem+json` refusal or a 404
    // does, and that is what a prefix-matched dispatcher produces here.
    expect(response?.status()).toBe(200);

    await expect(page.locator(SPA_ROOT)).toHaveCount(1);
    await expect(page.locator(SSR_MAIN)).toHaveCount(0);

    // And it is the invoice **list**, not merely some SPA screen. `.first()`: item 6 (QA round 1)
    // staffs several new roster consultants on the same client, so more than one row can carry
    // this exact name — this only needs "the list has loaded".
    await page
      .getByText('Banque Nationale de Test', { exact: true })
      .first()
      .waitFor({ state: 'visible' });
    // `role="group"` with `aria-pressed` toggle buttons, not `role="tab"`/`radiogroup`
    // (`toggle-pill-group.tsx`'s own comment on why) — found stale while fixing the assertion
    // above for item 6 (QA round 1): this line still expected the tab pattern item 8 (QA round 1)
    // replaced.
    await expect(page.getByRole('button', { name: 'Brouillon' })).toBeVisible();
  });

  test('a full navigation to /factures/:id lands on the SPA invoice detail', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the dispatcher does not know the viewport');

    await choosePersona(page, 'billing-paris');
    const id = await anyInvoiceId(page);

    const response = await page.goto(`/factures/${id}`);

    expect(response?.status()).toBe(200);
    await expect(page.locator(SPA_ROOT)).toHaveCount(1);
    await expect(page.locator(SSR_MAIN)).toHaveCount(0);
    await page.getByText('Émetteur').waitFor({ state: 'visible' });
    // The SPA detail links *out* to the printable one. Its presence is the clearest proof this is
    // the SPA screen and not the printable document, which links to nothing.
    await expect(page.getByRole('link', { name: 'Version imprimable' })).toHaveAttribute(
      'href',
      `/facture/${id}`,
    );
  });

  test('the singular printable /facture/:id still answers the server-rendered document', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the dispatcher does not know the viewport');

    await choosePersona(page, 'billing-paris');
    const id = await anyInvoiceId(page);

    const response = await page.goto(`/facture/${id}`);

    expect(response?.status()).toBe(200);
    // ADR-0055's printable invoice: server-rendered, never the SPA document.
    await expect(page.locator(SSR_MAIN)).toHaveCount(1);
    await expect(page.locator(SPA_ROOT)).toHaveCount(0);
  });

  test('the other reserved prefix, /releve/:id, still answers the server-rendered Cra', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'the dispatcher does not know the viewport');

    await choosePersona(page, 'consultant-paris');
    const id = await anyCraId(page);

    const response = await page.goto(`/releve/${id}`);

    expect(response?.status()).toBe(200);
    await expect(page.locator(SSR_MAIN)).toHaveCount(1);
    await expect(page.locator(SPA_ROOT)).toHaveCount(0);
  });
});

/**
 * Item 5, QA round 1: `index.html` declared no favicon. The fix is a path under `src/`, not
 * `public/` (a `public/` file would land at `dist/favicon.svg`, past the `/assets/*` route
 * `apps/api/src/web/spa.ts` actually serves, and 404 in the topology `E2E_SERVED_BUILD=1` drives —
 * see that route's own header). Checked in both topologies for the same reason `routing.spec.ts`'s
 * other tests are: Vite's dev server resolves the reference one way, Fastify's `/assets/*` the
 * other, and this is the one file that spans both.
 */
test.describe('item 5 — the favicon actually resolves', () => {
  test('the declared <link rel="icon"> answers 200 with an SVG content type', async ({ page }) => {
    await page.goto('/');

    const href = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute('href');
    if (href === null) throw new MarkupAssumptionError('index.html always declares a favicon.');

    const response = await page.request.get(href);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/svg+xml');
  });

  /**
   * Item 15, QA round 3 added a PNG fallback and an apple-touch-icon beside the SVG, and narrowed
   * the assertion above to `[type="image/svg+xml"]` so it kept testing the file it names. That
   * narrowing left the two new ones asserted by nothing — an icon that 404s is exactly the defect
   * item 15 was raised for, and both were hand-rasterised in a sandbox with no image tooling.
   * So: every icon link `index.html` declares, whatever its type, resolves.
   */
  test('every declared icon link resolves, not only the SVG', async ({ page }) => {
    await page.goto('/');

    const links = page.locator('link[rel="icon"], link[rel="apple-touch-icon"]');
    const count = await links.count();
    // Three today (SVG, PNG, apple-touch). Asserted as "more than one" rather than as an exact
    // number: the point is that this test cannot silently degrade to covering only the SVG again.
    expect(count).toBeGreaterThan(1);

    for (let index = 0; index < count; index += 1) {
      const href = await links.nth(index).getAttribute('href');
      if (href === null) throw new MarkupAssumptionError('every icon link carries an href.');

      const response = await page.request.get(href);

      expect(response.status(), href).toBe(200);
      expect(response.headers()['content-type'], href).toContain('image/');
    }
  });
});
