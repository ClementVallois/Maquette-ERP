# ADR-0055 — The invoice is a printable HTML page, and there is no PDF engine

- **Date**: 2026-08-21
- **Status**: accepted

## Context

`docs/BUILD-PLAN.md` § 6.5 asks for "the invoice as a printable HTML page carrying every legal
mention (no PDF engine, and the exclusion has its threshold)". `docs/BUILD-RULES.md` § Stack lists
"PDF generation" among the things not in this repository. This ADR is the threshold that list owes,
written at the point where the exclusion first costs something.

It costs something because an invoice is not an ordinary screen. It is a document a client
receives, an accountant files and, in France, the tax administration may ask for six years later.
The reasonable expectation is a PDF, and a mockup that renders one in a browser instead invites the
question of whether the difference was thought about.

Two facts frame it. The mockup **issues nothing** — `docs/CLAUDE.md` puts "actual invoice dispatch"
in the README's "Ce que je ne construis pas", so no document leaves this system to anyone. And the
mandatory mentions are already **modelled rather than templated** (ADR-0017): `LegalMentions`,
`PaymentTerms`, `BilledParty`, `LegalEntity` and the `VatGroup.mention` computed per rate are
fields of the aggregate, so what any renderer prints is decided by the domain and not by the
renderer.

## Decision

**The invoice renders as an HTML page with a print stylesheet, and every mention on it comes from
the aggregate.**

Four consequences of that, and the third is the one that makes the choice defensible rather than
merely cheap:

- **No new dependency.** A PDF library is a large transitive tree with font handling and, in the
  browser-driven case, a headless Chromium — in a repository whose working rule is "do not add a
  dependency" and whose subject is a cybersecurity firm's supply chain.
- **The print stylesheet already exists.** `@media print` hides the header, the footer and every
  `no-print` control; the document is what remains. The marginal cost of "printable" here is a
  handful of rules, not a rendering pipeline.
- **A page can be asserted; a PDF has to be trusted.** The integration tests read the rendered
  markup and check that the SIREN, the RCS registration, the VAT recapitulative and the
  early-payment mention are on it. Against a PDF the equivalent test extracts text from a binary
  and asserts on the extraction — which passes when the extractor is wrong in the same direction as
  the renderer. The mentions are the part of this document that must not silently disappear, and
  HTML is the representation in which their absence is a failing test.
- **Nothing about the model changes if a PDF is added later.** ADR-0017 already put the mentions on
  the aggregate; a PDF renderer would be a second consumer of the same fields, which is exactly the
  threshold ADR-0025 names for a template engine.

## Rejected option

**Generate a PDF, with Puppeteer or a PDF library.** The realistic choice for a real ERP, and the
one that matches what a client expects to receive. It loses here on three counts, in order of
weight: nothing is dispatched, so the artefact has no recipient and the format has no reader; the
supply-chain cost is real and this repository argues about supply chains; and the assertion problem
above turns the most important property of the document — that every mandatory mention is present —
into a test on a binary.

**Print to PDF from the browser and call that the deliverable.** Tempting, because it is what the
decision above lets a user do anyway. It is not rejected as a _user action_ — it is what the print
stylesheet is for. It is rejected as a _claim_: browser print output carries the browser's headers
and footers unless the user turns them off, and paginates differently per engine. The repository
says the invoice is a printable page, not that it produces a conforming PDF.

## Reconsideration threshold

Reopen the day a document is **sent** — the first email, the first download link, the first
Factur-X or UBL payload for the e-invoicing reform. At that point the recipient is not a browser,
the format is prescribed rather than chosen, and the argument above inverts: the structured
electronic format becomes mandatory and the HTML page becomes the preview.

Reopen sooner if pagination becomes load-bearing — an invoice long enough that page breaks fall
inside a line, or one that must carry a page number in a legally prescribed place. CSS paged media
covers the easy half of that and nothing covers the hard half.

## Consequences

**Easy.** The invoice is a URL. It is shareable, linkable from the pré-facturier, diffable in a
test, readable by a screen reader, and it costs one page object and a few print rules. The mentions
on it are the aggregate's fields, so a mention that stops being carried is a mention that stops
compiling.

**Expensive.** There is no artefact to attach to anything. Anyone wanting a file prints the page,
with whatever the browser adds. And "carrying every legal mention" is checked by tests naming each
mention rather than by a conformance tool — which is a real limit, and it is the same limit the
open-questions row about ADR-0010 already records: the mentions themselves have not been validated
by an accountant.
