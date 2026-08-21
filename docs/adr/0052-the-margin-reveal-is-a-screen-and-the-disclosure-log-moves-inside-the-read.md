# ADR-0052 — The margin reveal is a screen of its own, and the disclosure log moves inside the read

- **Date**: 2026-08-21
- **Status**: accepted

## Context

`docs/BUILD-PLAN.md` § 6.4 specifies the pré-facturier's progressive-disclosure control in one
sentence: `Tjm` and margin are "never in the table", and each sits behind "an explicit **reveal
click** — a plain link to the logged single-record read of 5.3, no script".

Read literally, "a plain link to the logged single-record read of 5.3" is an `<a href>` pointing at
`GET /api/v1/consultants/:consultantId/economics`. That link does not work, and the reason is a
decision this repository already took: `representationOf` (task 6.1) sends every path under
`/api/` to `application/problem+json` and everything else to HTML, deliberately, so that a `curl`
reproducing a screen's bug gets the same answer the screen got. A browser following that link
therefore lands on a JSON document — which is not a screen, carries no shell, no persona bar and no
refusal page, and would render a raw `cjmCents` as the browser's idea of a document.

So the reveal needs a screen path. The moment it has one, there are **two** routes that read
`Cjm`, `Tjm` and margin, and BUILD-PLAN 5.3 requires that every such read be logged — actor, field,
target. Today that log line is written in the API handler, next to the call. A second handler means
either a second copy of it, or none on the new path.

## Decision

**Two things, and the second is the one that matters.**

1. **The reveal is a screen at `/marge/:consultantId?periode=YYYY-MM`**, French like every other
   screen path (ADR-0026), rendering the same `ConsultantEconomics` record the API serves. The
   pré-facturier links to it per consultant row.

2. **The disclosure log moves out of the route and into `consultantEconomics` itself.** The
   function that reads the sensitive fields is the function that records having read them, so a
   third caller cannot be written without one. `EconomicsDependencies` gains a `log`, and both
   routes pass the request's logger — which is what keeps the `correlationId` on the disclosure
   line the same one the request carries (ADR-0024).

Three details follow from putting it there rather than in the handlers:

- **It logs only what it returns.** `assertMayRead` throws before any rate is read, so a refused
  attempt writes no disclosure line — a refusal is not a disclosure, and recording it as one would
  make the log unusable for the question it exists to answer. A consultant who does not exist
  returns `null` and logs nothing, for the same reason.
- **It logs the field names and never their values.** Unchanged from the API route, and it is the
  point of ADR-0024's allowlist: a disclosure record that published the amount would be the leak
  the control exists to make expensive.
- **The link is rendered for `manager` and `billing` alike, and `billing` is refused when it
  follows.** BUILD-PLAN's phase-6 row asks for "the refusal reason shown, not a greyed-out button",
  and this is the case it was written for: `economics` is `office` for a manager and `none` for
  billing (ADR-0023), so a billing persona clicking the link gets the denied page naming
  `insufficient-role`. A hidden link would teach a reader nothing; a refused one demonstrates the
  matrix.

## Rejected option

**Negotiate on `Accept` so the same `/api/v1` URL serves HTML to a browser and JSON to `curl`.**
It is the textbook answer and it would have made BUILD-PLAN's sentence true as written, with no new
route at all.

It loses because `representationOf` already rejected it, in this repository, for a reason that has
not changed: a browser sends `text/html` on every request including the ones to `/api/v1`, so
negotiation makes the API's representation depend on **who asked** rather than on **what was asked
for**. The bug a screen shows and the bug `curl` reproduces would then be two different responses,
which is precisely the debugging failure the path rule was chosen to prevent. Adding an exception
for one URL is worse than the general case: it is a rule with a hole, and the hole is on the one
route that serves the most sensitive fields in the system.

**Keep the log in the two handlers and accept the duplication.** Two lines, no indirection, and the
argument for it is real — the handler is where the request context lives. It loses on the
arithmetic this whole repository is arranged around: two copies of a control is one copy that rots,
and the failure is silent. Nothing turns red when the second handler forgets to log; the only
symptom is an audit trail with a hole in it, discovered by the person who needed it.

## Reconsideration threshold

Reopen if a third representation of the same record appears — an export, a CSV, a webhook payload.
At that point the log call inside `consultantEconomics` still fires, but "which fields" stops being
a constant and has to be passed in, because an export that ships four fields must not log the three
this one does.

Reopen the screen path itself if an external consumer ever reads `/api/v1` (the same threshold
ADR-0008's OpenAPI note names). Two audiences on one URL is when content negotiation stops being a
liability and starts being the contract.

## Consequences

**Easy.** The reveal is a real screen: it has the shell, the persona bar, French formats, and its
refusals are the same rendered `problem+json` every other screen shows. Adding a caller of
`consultantEconomics` is now safe by construction — the disclosure line comes with the data.

**Expensive.** `consultantEconomics` takes a logger, so a unit test of it must pass one; the
narrowed `DisclosureLog` interface is one method wide, which keeps that cost to a line. It is a
structural narrowing of pino's type, not a port, and BUILD-RULES names that distinction so this does
not read as a port introduced without a second implementation.

**What this does not change.** The control is still the extra request, not the secrecy. `Cjm`, `Tjm`
and margin remain absent from every list projection (ADR-0003) and from the pré-facturier's table;
what this ADR moves is where the record of the read is written, not how many round trips a scrape
costs.
