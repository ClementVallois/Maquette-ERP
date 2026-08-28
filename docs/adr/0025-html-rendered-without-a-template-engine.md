# ADR-0025 — HTML is rendered without a template engine, by a tag that refuses what it cannot escape

- **Date**: 2026-08-21
- **Status**: accepted

## Context

ADR-0009 decided server-rendered HTML "from plain template functions", with no client framework and
no front build step. It did not decide **how the markup is produced**, and that turns out to be the
security-relevant question of the whole phase.

The naive reading of "plain template functions" is string concatenation with an `escapeHtml` helper
called by hand. That is how most hand-rolled renderers start and it fails in a specific, well-known
way: **escaping is not one operation.** Replacing `&<>"'` is correct in text and in a **quoted**
attribute, useless in an **unquoted** one (a space ends the value, and no character the escaper
touches is involved in `x onclick=alert(1)`), and actively wrong inside `<script>` or `<style>`,
where a browser decodes no character references at all — `&lt;` stays four characters and the
injected payload runs. A single escaper is therefore safe in the context its author had in mind and
silently unsafe in the other three, and the failure is invisible to a test that only asserts the
happy path.

BUILD-PLAN 6.1 says this is the one place to be generous rather than minimal, and gives the reason:
in a cybersecurity firm's repository, an XSS in the invoice screen discredits everything else in it.

## Decision

**A tagged template, `html`, that escapes by default and — this is the part that distinguishes it —
parses the static halves of the template so it knows which context each hole lands in, and
_refuses_ every hole it cannot make safe.**

The static halves are the parts the author wrote. Interpolated data is never parsed, only escaped,
sanitised or refused. A deliberately small subset of the HTML tokenizer runs over each chunk and
resolves the hole that follows it to one of three outcomes:

| Where the hole lands                                             | What happens                  |
| ---------------------------------------------------------------- | ----------------------------- |
| Text, and RCDATA (`<title>`, `<textarea>`, where escaping works) | escape `&<>"'`                |
| A **quoted** attribute value                                     | escape                        |
| A quoted **URL-bearing** attribute (`href`, `src`, `action`, …)  | scheme allowlist, then escape |
| An **unquoted** attribute value                                  | **refuse**                    |
| An `on*` attribute, or `style`, or `srcset`                      | **refuse**                    |
| A `<script>` or `<style>` body (RAWTEXT)                         | **refuse**                    |
| A tag name, an attribute name, a comment, a doctype              | **refuse**                    |

There is no fourth outcome, and "refuse" is what the scanner returns for any state it does not
recognise — a misparse costs a page that does not render, never a page that executes.

Three details that are decisions rather than implementation, because each has an obvious wrong
answer:

- **The URL scheme is read off a copy with ASCII whitespace and C0 controls stripped**, because a
  browser resolves the scheme after discarding exactly those. `java\tscript:` navigates, and a
  sanitiser that tests the raw string passes it through. The allowlist is `http`, `https`,
  `mailto`; a relative URL has no scheme and is allowed; a protocol-relative `//host/path` is
  refused, since nothing here links off this origin.
- **`srcset` is not in the URL-bearing set on purpose.** It is a comma-separated list with
  descriptors, and a sanitiser written for one URL would wave the second one through. The hole is
  refused instead of half-checked.
- **The opt-out takes its reason as an argument**: `trustedMarkup(markup, why)`, which throws on an
  empty one. `grep -rn 'trustedMarkup(' apps/` therefore enumerates every place raw markup enters a
  page **with the argument for it on the same line**. A comment above the call would rot; an
  argument cannot. And it is genuinely the only route: `Html` carries a `#private` field, so an
  object shaped like one is not one, and the tag refuses anything failing `instanceof` rather than
  calling `toString()` on it.

**Coverage**: `apps/api/src/web/render/**` joins `coverage.include`, next to the domain and the
kernel. It is the third entry and the first outside `packages/`. The rest of `apps/` stays out —
a route handler proves nothing by being executed — and this file is where that asymmetry is
recorded rather than left to be inferred from a glob. The module stands at 100 % of statements and
95.6 % of branches, above the repository thresholds, and every refusal above has a negative test.

## Rejected option

**A template engine — Eta, Handlebars, Nunjucks.** The obvious answer, all three are small and
mature, and all three escape by default. It loses on three counts, in descending order of weight:

1. **It buys a weaker guarantee than the one written above.** Every one of them escapes with a
   single context-free function. `<a href={{url}}>` in Handlebars produces exactly the unquoted-
   attribute hole this decision refuses, and `{{{triple}}}` is an opt-out with no reason attached
   and no way to enumerate the argument for it. A dependency that ships the weaker half of the
   control is a dependency that makes the control harder to state, not easier.
2. **Markup would move out of TypeScript.** A `.eta` file is not typechecked, not covered by
   `tsc --noEmit`, and not reached by `eslint`. The screens' data comes from typed repositories,
   and a template that cannot see those types re-opens exactly the class of mistake — a field
   renamed on one side — that the rest of this repository spends its gates on.
3. **BUILD-RULES' dependency ritual applies, and would have to be paid mid-phase.** A new
   dependency is proposed with its evaluation grid and must clear the 7-day `minimumReleaseAge`
   quarantine. Phase 6 otherwise adds **zero** dependencies.

**A single `escapeHtml()` called by hand at each interpolation.** Cheapest of all, and the one this
decision exists to reject. Beyond the context problem: it relies on the author remembering, on every
line, forever. The failure mode is a green test suite and one forgotten call, which is the named
failure family this repository exists to rule out — a guard that stopped looking.

**Escaping the unquoted-attribute case instead of refusing it.** It is possible: escape every
non-alphanumeric character as `&#xNN;`, which is the OWASP recommendation for that context. It
loses because it makes the _other_ contexts worse — one escaper cannot be both aggressive enough
for an unquoted attribute and quiet enough for a paragraph of French prose, so it would mean two
escapers and a rule about which to use, which is the rule the author forgets. Quoting the attribute
costs two characters and the refusal names them.

## Consequences

**Easy.** A screen is a function returning `Html` and composes by nesting; arrays of templates join
with nothing between them, which is every table body in this application. The markup is TypeScript,
so it is typechecked, linted, formatted and covered like anything else. Zero dependencies added.

**Expensive.** The scanner is ~180 lines of state machine that has to be right, and it is a subset
of a specification with famously many edge cases. Two things bound that cost: it only ever reads
the static markup **this repository writes** — never the network, never the database — and every
state it does not recognise refuses rather than guesses. It is also the reason for a test file with
46 cases, three of which were verified by mutation (removing the unquoted-attribute refusal, the
control-character stripping, and the RAWTEXT distinction each turn tests red).

The second cost is a correctness trap worth naming, because it bit this file's own first draft: the
scanner reads only the chunks that **precede** a hole. A construct written after the last
interpolation is never parsed, so a test that exercises `<input … />` with the `/>` in the trailing
chunk exercises nothing. The scanner tests all put the hole after the construct, and the file says
so where it would otherwise be re-learned.

Third, a mechanical trap that cost this phase an afternoon and is written here because nothing in
the code can carry it: **Prettier formats HTML inside a tag literally named `html`**. Its default
`embeddedLanguageFormatting: "auto"` reflowed the templates in the test file, inserting newlines
into text nodes and rewriting `<div  >` as `<div>` — that is, it silently edited both the rendered
output and the deliberately malformed markup the scanner tests exist to exercise. The setting is
now `"off"` in `.prettierrc.json`, which is a JSON file and cannot hold the reason.

Fourth: `refuse` means `throw`, at render time, from a `TechnicalFailure`. A template with a hole in
a bad place is a 500 rather than a compile error. TypeScript cannot express "this hole is in a
quoted attribute", so the check is where it can be — and the unit tests are what make it a
development-time failure in practice rather than a production one.

## Reconsideration threshold

Reopen at a **second consumer of the same markup** — a partner embedding these screens, a second
application rendering the same invoice — which is when the renderer becomes shared code and the
argument for owning it weakens against the argument for a standard one.

Reopen also at the first genuine need for markup this scanner cannot express: an inline `<script>`
with server data in it (the answer then is a `<script type="application/json">` block and a parse,
not a relaxation of the RAWTEXT refusal), or a `style` attribute driven by data (the answer is a
class). If either becomes routine rather than occasional, the decision to hand-roll is the one that
was wrong.
