# ADR-0114 — `Html`'s construction and unwrapping are compiler-enforced, not `@internal`-commented

- **Date**: 2026-09-07
- **Status**: accepted

## Context

Package 13 of the audit (`docs/clean-up-audit.consolidated.local.md`): "`Html.of` is publicly
callable despite an `@internal` comment and bypasses `trustedMarkup`'s reason argument. No
external production caller was found. Close that construction escape hatch, or make the trusted
construction boundary mechanically clear while removing unused raw-markup APIs."

Verified directly against the tree rather than assumed: `Html.of` and `Html.read`
(`apps/api/src/web/render/html.ts`) were `static` members of an exported class, each carrying only
an `@internal` JSDoc tag — a comment, never enforced by the compiler (this project's `tsconfig.json`
does not set `stripInternal`, and even if it did, that flag only affects generated `.d.ts` output,
not `tsc`'s own type-checking of the source that declares the member). `grep -rn 'Html\.of\b'
apps/api/src` outside `html.ts` found nothing, and neither did the same search for `Html.read` —
matching the audit's "no external production caller was found" — but absence of a caller is not
the same claim as absence of a hole: any file in `apps/api` could write `Html.of('<script>')` and
obtain unescaped markup with no reason string, no scanner, no escaping, bypassing everything this
module exists to guarantee (ADR-0025). This is exactly the file `vitest.config.ts`'s own coverage
config calls "the only code in this repository whose failure is an XSS."

## Decision

**Close the hole, mechanically, rather than merely document it more clearly.** `Html.of` and
`Html.read` are now `private static`. TypeScript's `private` restricts access to the declaring
class's own members — confirmed empirically before relying on it: a throwaway same-file top-level
function calling a `private static` class member fails with `TS2341`, so `private` here is a real
compiler boundary, not file-scoped convention. Because that restriction is per-_class_, not
per-_file_, the two free functions that used to reach into `Html` from outside its body — `render`
(the recursive interpolation-context dispatcher) and the `html` tagged-template tag itself — had to
become `private static Html.render` and `static Html.tag`. `trustedMarkup`'s own body (the reason
check, then construction) moved to `static Html.trustedMarkup` for the same reason. The three
exported functions the rest of the codebase already calls — `html`, `trustedMarkup`,
`renderToString` — keep their exact names and signatures and now delegate in one line each to
`Html.tag`/`Html.trustedMarkup`/`Html.renderToString`, so no caller anywhere in `apps/api` changes.

Verified with a compile-time assertion, since the fix is a compiler boundary and has no runtime
behavior to exercise: `html.test.ts` gained two `// @ts-expect-error` lines directly calling
`Html.of`/`Html.read`. `@ts-expect-error` itself fails `pnpm run -s typecheck` ("unused directive")
if the following line does _not_ produce a type error — confirmed both ways, in the order the
audit's own package discipline asks for: the block was added while `of`/`read` were still public
(the directive was unused, `typecheck` failed), then the class was changed and `typecheck` passed.
Re-confirmed the other direction afterward by temporarily reverting `of`/`read` to public and
watching the same two lines fail again before restoring the fix.

## Rejected option

**"Make the trusted construction boundary mechanically clear" without closing it** — the audit's
own second-listed option, e.g. renaming `of`/`read` to something more clearly internal-sounding, or
strengthening the `@internal` comment's wording. Rejected: a clearer comment is still a comment: the
empirical test above (a same-file function calling a `private static` member) is what proves a
comment can never provide, and the audit's own evidence ("bypasses `trustedMarkup`'s reason
argument") is precisely the failure mode a comment cannot prevent, only describe. The compiler-
enforced version costs the same one-time refactor and leaves nothing weaker behind it.

**A construction token/symbol gate** (a module-private `Symbol` passed to a nominally-public
constructor, throwing at runtime if the caller doesn't hold it — the common userland pattern for
"private across files" in older TypeScript). Rejected: it trades a compile-time guarantee for a
runtime one, checked once per construction rather than once per build, for a class whose entire
value proposition is that a mistake here is caught before the page renders, not after.

**Leaving `render`/`html` as free functions and inventing a second, wider one for cross-file
"friend" access** (e.g. `Html.unsafeConstruct`, exported but named to discourage use). Rejected:
this is the exact shape of the original hole with a scarier name — anything exported and public is
callable by anything else in the repository regardless of its name, and this codebase's own
`consistent-type-assertions`/`no-non-null-assertion` discipline exists precisely because a
discouraging name has never stopped a caller under deadline pressure.

## Reconsideration threshold

If a genuine second module ever needs to construct pre-escaped `Html` from data it trusts for
reasons `trustedMarkup`'s single reason-string contract cannot express (e.g., a second escaping
engine for a different output format that still needs to compose with this one), reopen this ADR
to decide whether that is a new named factory on `Html` itself (extending `trustedMarkup`'s own
shape) rather than reopening `of`/`read`.

## Consequences

- `render` and the `html` tag's bodies moved into the `Html` class verbatim (no logic changed) —
  confirmed by the coverage report before and after (`html.ts`: 100/95.59/100/100 statements/
  branches/functions/lines, unchanged) and by all 47 of `html.test.ts`'s existing cases passing
  unchanged.
- `escape`, `renderInAttribute`, `sanitiseUrl`, `Scanner` and every other helper in this file stay
  exactly where they were, as free functions/classes outside `Html` — none of them ever touched
  `Html.of`/`Html.read`, so none of them needed to move.
- A future reader who wants to know "what can construct an `Html`" now gets a compiler error for
  the wrong answer instead of having to trust that everyone read the comment.
