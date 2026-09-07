# Should the server-rendered pages be sunset?

**Status: analysis, not a decision.** This file argues both sides and ends on a recommendation.
It is deliberately **not an ADR**: `CLAUDE.md` reserves `docs/adr/` for decisions Clement makes and
authors. When this is decided, the ADR is written there and this file is linked from it.

Written 06/09/2026, after the session that fixed the printables' hybrid header (ADR-0055/0056 pages
now carry the SPA's own topbar), removed the invoice's duplicate bottom link, and fixed `.no-print`
losing on specificity.

## What is actually left

The server-rendered layer is `apps/api/src/web/`: **2 627 lines** of TypeScript, **2 742 lines** of
tests for it, and a hand-written **642-line** stylesheet. It registers **9 routes**:

| Route                                | Kind                         | Still reachable from a screen?     |
| ------------------------------------ | ---------------------------- | ---------------------------------- |
| `GET /assets/style-*.css`            | the SSR stylesheet           | yes — by the two pages below       |
| `GET /releve/:id`                    | Cra printable (ADR-0056)     | **yes** — 3 links in the SPA       |
| `GET /facture/:id`                   | invoice printable (ADR-0055) | **yes** — 1 link in the SPA        |
| `POST /facture/emission/:id`         | issue an invoice             | yes — the form on the invoice page |
| `POST /persona/retrait`              | change persona               | yes — the form in the SSR topbar   |
| `POST /persona`                      | choose a persona             | **no**                             |
| `POST /consultant/cra/:period`       | save/submit a month          | **no**                             |
| `POST /pre-facturier/validation/:id` | validate a Cra               | **no**                             |
| `POST /pre-facturier/refus/:id`      | refuse a Cra                 | **no**                             |

The last four are the finding that matters. Phase 9.3 removed the SSR _screens_ and kept their write
verbs; the SPA writes through `/api/v1` instead. Grepping the whole SSR layer for `method="post"`
returns exactly **two** forms — the issuance form and the persona-change form. **Four write verbs
have no HTML form anywhere pointing at them.** They are exercised only by their own tests.

So "the SSR pages" is already a much smaller thing than it looks: two printable GETs and their two
supporting POSTs, plus four verbs kept alive by nothing but their test suite.

## The case for removing them

1. **It is a second application.** A second stylesheet with its own tokens (`--ink`, `--paper`,
   `--accent`) against the SPA's; a second `labels.ts`; a second HTML renderer with its own escaping
   contract (ADR-0025); a second navigation model. Every one of those is a place where the two sides
   can drift.
2. **They demonstrably do drift, and it is visible to a reader.** The hybrid header fixed on
   06/09/2026 is the evidence: the printables carried a wordmark, a `.who` bar and a horizontal nav
   strip the SPA has nowhere. Nobody noticed until someone opened the page and said it looked like a
   different product. That is the exact failure mode a mockup being judged on coherence cannot
   afford.
3. **Four dead write verbs are carrying test weight.** Tests that exercise a path no screen can
   reach prove that the path works, not that anything needs it. `CLAUDE.md`: "No test that proves
   nothing."
4. **The SPA already renders both entities.** `/factures/$id` and `/cra/$period/$consultantId` show
   the same invoice and the same Cra. The printables are not the only way to see this data — they
   are a second rendering of data already on screen.
5. **Scope discipline.** The README's "Ce que je ne construis pas" is a load-bearing part of the
   deliverable. Two routes maintained "because they exist" is the kind of thing that section is for.

## The case for keeping them

1. **`/facture/:id` is the only artefact in this repository that behaves like a document.** A
   stable URL, an A4 `@page` box, legal mentions printed from aggregate fields rather than typed
   prose (ADR-0017), and a VAT recapitulative at the granularity the law requires (ADR-0010). The
   chain this mockup claims to prove ends in _an invoice_ — not in a screen showing invoice data.
   Deleting the document weakens the claim.
2. **It is a real answer to "can you produce the invoice?"** in a demo. The audit trail printed on
   the page (each line naming the Cra it came from — the _piste d'audit fiable_) is a thing to hand
   someone, not a thing to scroll.
3. **No JavaScript, and that is a property, not an accident.** These pages render and print with
   scripting off. For a cybersecurity firm's internal tool that is a point worth being able to make.
4. **The cost is mostly already paid.** The 2 627 lines exist and are tested and green. Removal is
   itself work, and work that produces no new capability.
5. **ADR-0055 and ADR-0056 exist.** Reversing a recorded decision needs a superseding ADR that says
   what changed. "It felt like duplication" is not that.

## What removal would actually entail

Not a delete. Honestly sized:

- Move print to the SPA: a `@media print` stylesheet for `/factures/$id` and the Cra view, an `@page`
  A4 box, and the legal mentions rendered on the SPA's invoice screen. Checked rather than assumed:
  the SPA **already receives** all five (`LegalMentions` — late-payment rate, recovery indemnity,
  early-payment discount, operation category, VAT-on-debits) and **renders exactly one** of them,
  `operationCategory`. So this is a rendering gap, not a data-fetching one — cheaper than it looks,
  but still four mentions and the VAT recapitulative to build and to test.
- Accept that printing now requires JavaScript to have run.
- Delete `apps/api/src/web/` minus what `problem-page.ts` and the API's own error rendering still
  need — that dependency needs checking before any estimate is trusted.
- Remove 4 links from the SPA, 9 route registrations, ~2 700 lines of tests.
- Write the superseding ADR against ADR-0055/0056.

## Recommendation

**Keep the two printables. Delete the four dead write verbs now.**

The two halves of "the SSR pages" have opposite answers, and lumping them together is what makes
this look like a bigger question than it is:

- The **four unreachable POST verbs** are not a decision, they are dead code with a test suite
  attached. They can go in an ordinary cleanup commit, no ADR needed beyond a line in the commit
  message — nothing is being decided, something is being removed that nothing uses.
- The **two printables** earn their place, but on a narrower ground than "they exist". The ground is
  that the invoice is a _document_, and the mockup's whole claim is a chain that ends in one. That
  is worth a second rendering path. It is not worth a second _design system_ — which is why the
  header fix of 06/09/2026 was the right response to the drift, rather than deletion.

The honest risk in keeping them is that the drift recurs. The mitigation is cheap and already
half-built: the SSR chrome now mirrors the SPA topbar, and `accessibility.test.ts` asserts the
crumbs. A test that the two sides' persona rendering agrees would close it further.

## The threshold that would change this answer

Revisit if **any** of these becomes true:

- The SPA's invoice screen grows the four unrendered legal mentions and the VAT recapitulative on
  its own (then the printable is genuinely a duplicate, and the argument in "keeping", point 1,
  collapses — the data is already on the wire, so this could happen almost incidentally).
- A third design divergence between the SSR chrome and the SPA reaches a reader — twice is a fix,
  three times is a structural problem.
- The printables need a feature that pulls JavaScript into them; at that point they are a worse SPA
  route rather than a better document.

## Open item this does not settle

Whether the invoice printable's `table.lines` should scroll or reflow at 360px — it currently
overflows the viewport horizontally (found 06/09/2026, pre-existing, untouched). That is a bug in a
page we may be keeping, and it is tracked as its own row in
[`docs/open-questions.md`](open-questions.md) dated 07/09/2026 — tied to this question rather than
separate from it, because a printable being replaced does not get a responsive fix.
