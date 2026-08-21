# ADR-0026 — One screen language, French, with every visible string in one file

- **Date**: 2026-08-21
- **Status**: accepted

## Context

BUILD-RULES says everything is English except `README.md`, and gives the reason for the exception:
the README addresses a French-speaking reader who opens the repository cold. The screens are the
second thing that addresses a reader rather than a maintainer, and no decision covered them.

Left undecided, this settles itself badly and invisibly. The domain vocabulary is already partly
French on purpose — `Cra`, `Regie`, `Tjm`, `Intercontrat` stay French because translating them
loses contractual meaning (`CONTEXT.md` § Language rule). A screen that renders those French terms
inside English chrome produces "Validate the Cra for the period juin 2026", which is not a language;
it is the absence of a decision, showing.

There is a second, quieter question underneath: **where the strings live.** Wording is the part of a
screen a non-developer can judge, and this repository's whole premise is that Clement owns the
decisions while the code is delegated. Wording scattered across fifteen template functions cannot be
reviewed as a whole by anyone.

## Decision

**The screens are in French — labels, headings, error text, and the URLs — and every string a
visitor reads lives in `apps/api/src/web/labels.ts`.**

Keys are English because they are code; values are French because they are the screen. That split
is the whole rule, and it is the same one `CONTEXT.md` already applies one layer down.

**The URLs take the screen's language too**: `/persona`, `/persona/retrait`, and the screen paths
the later tasks of this phase add. `/api/v1` stays English. The line is not arbitrary — a URL is
read aloud in a demo, typed from a phone and pasted into a message, so it is part of the user
interface; an API path is a code interface and takes the code's language. `PATHS` holds them in one
place so a link and the route it points at cannot drift, since the one that rots is always the link.

**Formatting is French too**, and it lives next to the labels: decimal comma, `JJ/MM/AAAA`, ISO
weeks from Monday, `Europe/Paris` (BUILD-RULES § Working discipline). Two things there are
decisions rather than detail:

- **`Intl` is not used for money.** `Intl.NumberFormat('fr-FR', { style: 'currency' })` takes euros,
  so reaching it means dividing cents by one hundred — a float on a monetary value, which
  BUILD-RULES forbids without qualification and ADR-0002 exists to prevent. The formatter does
  string surgery on the integer instead: it pads to three digits, cuts the last two, and groups the
  rest. **No arithmetic is performed on the amount at all**, so there is nothing for a rounding
  error to happen to, and a test asserts that the digits out are the digits in at seven magnitudes.
- **`Intl` is not used for dates either**, for a duller reason: its output moves with the ICU
  version bundled in Node, so a test that asserts a rendered page would be asserting the runtime.
  And a worked day is a `date` string — parsing it into a `Date` to reformat it is exactly how a
  day moves to the one before it west of Greenwich.

## Rejected option

**English screens, consistent with the rest of the code.** The tidier rule, and the one a reader
skimming BUILD-RULES would predict. It loses because it cannot actually be applied: `Cra`, `Regie`,
`Tjm`, `Intercontrat`, `Habilitation` and `Autoliquidation` stay French by an earlier decision that
this one may not overturn, so "English screens" means English chrome around French nouns. The
mixture is worse than either language, and it would be defended in a demo rather than explained.

**Interface strings inline in the templates, as most server-rendered applications write them.**
Fewer files, and each string sits where it is used. It loses on the review property above, and on a
second one that showed up while writing the first screens: the same concept picks up two names when
its two mentions are four hundred lines apart, and `CONTEXT.md` cannot police what it cannot see.
One file makes a contradiction with the vocabulary a two-line diff.

**A translation library (i18next, `Intl.MessageFormat`), against the day a second language is
needed.** Rejected as the plainest YAGNI case in the phase: there is one language, the audience is
one French firm, and a message catalogue with one locale is a label file with ceremony. If a second
language ever arrives, `labels.ts` is already the catalogue and the change is mechanical.

## Consequences

**Easy.** Every visible string can be read in one sitting and checked against `CONTEXT.md`. A term
this repository decided to keep French — `Cra`, `Tjm` — appears in the screens spelled the way the
vocabulary file spells it, and a drift is visible in a diff rather than found in a browser.

**Expensive.** A label used once is now two files away from where it renders, which is a real cost
at the smallest screens and the reason most projects inline them. Accepted deliberately: the
reviewer of these strings is not the person who wrote the template.

Second cost, stated because it is a limitation and not a feature: **the repository now has two
audiences with two languages**, and a maintainer reading a template sees `LABELS.problem.deniedBy`
rather than the sentence it renders. The labels file is organised by screen and by concern for
exactly that reason, so the sentence is one jump away and always the same jump.

Third: the money formatter is hand-written, and hand-written formatting of a monetary value is
normally a bad trade. It is the right one here only because it does **less** than the library —
it never converts, never rounds and never divides. If it ever needs to do any of those, that is the
threshold below, not a patch.

## Reconsideration threshold

Reopen the **language** decision at the first non-French-speaking audience for the running instance
— a foreign reviewer, an English-speaking interviewer given the link. The answer then is a second
label file and a locale on the request, not English strings mixed back into the templates.

Reopen the **hand-written formatter** the moment a screen needs a format that involves converting
or rounding a monetary value — a chart axis, a per-day average, a foreign currency. That is the day
the string surgery stops being sufficient, and the honest replacement is `Intl` applied to a value
the domain has already rounded to an integer, never to raw cents.

Reopen the **one-file** rule at roughly two hundred labels, where a single flat object stops being
readable in one sitting, which was its entire justification.
