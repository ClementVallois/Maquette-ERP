# ADR-0079 — Departure is a nullable date on the consultant, with a domain invariant

- **Date**: 2026-08-31
- **Status**: accepted

## Context

Item 6 (QA round 1) asks for consultants who have left the firm, "handled properly," among the
seed's historical data. `public.consultants` today has no such column: every consultant is
implicitly still with the firm, forever, and nothing distinguishes a veteran who left in 2022 from
one still on staff. The dataset needs both — someone who has left must be absent from a manager's
current picks (item 7's own roster filter, `consultantsOfOffice`, and any similar "who is staffed
today" read still to come), while their historical CRAs and invoices, already validated or issued
before they left, must stay exactly as readable as anyone's.

Getting this wrong in either direction is a real defect, not a cosmetic one: showing a departed
consultant in a manager's active roster is a staffing fact the mockup would be asserting falsely,
and hiding or deleting their historical records the day they left would erase invoiced,
already-settled work — the CRA-to-invoice chain this mockup exists to prove holds an invariant
("a validated CRA is immutable") that a deletion would violate more thoroughly than any code path
this repository has written on purpose.

## Decision

**A nullable `departure_date DATE` column on `public.consultants`** (migration `012-`).
`NULL` means still with the firm — the column's own default, so every consultant the seed already
writes needs no backfill and no migration-time UPDATE. A non-`NULL` value is the first date the
consultant is no longer staffable.

**The invariant lives in the domain, not only in this column: a `Cra` cannot be opened for a
period that starts after the consultant's own departure.** `Cra.open` now takes a required
`consultantDeparture: IsoDate | null` argument — required, not defaulted, so a caller that has a
consultant to hand cannot silently skip the check by omitting the argument rather than by deciding
to pass `null`. `assertNotAfterDeparture` compares the period's first day against the departure
date as plain `IsoDate` strings (the same lexicographic-comparison idiom `reference.ts` already
uses for a date span), and throws the new typed `CraAfterDepartureError`
(`/problems/cra-after-departure`, mapped to 409 — the value is fine, the _state_ of the consultant
as of that date is what refuses it, the same reasoning `MissingHabilitationError` already gives for
its own 409). The check runs at `open` only, never at `reconstitute`: a departure erases nothing,
so a `Cra` legitimately opened before someone left stays loadable for as long as its own row
exists, and the guard has no opinion on a row it did not create.

**Readers change, narrowly.** `PgReferenceReader.consultantsOfOffice` — item 7's own new route,
ADR-0077, the option list a manager's filter picks from — gains `AND departure_date IS NULL`: a
departed consultant is not staffable, so they drop out of the list a manager builds a _new_ filter
from. `consultantNames` (the presentation map that labels rows by id, used by the pré-facturier and
`GET /api/v1/cras`) is deliberately left unfiltered: it has to keep labelling a departed
consultant's own historical rows correctly, and filtering it would silently blank a name on an
otherwise perfectly readable historical CRA. No other reader touches `public.consultants` in a way
this ADR changes — `consultant-economics.ts` and `cra-grid.ts` both read one named consultant by
id, for a specific historical or current record, and neither should refuse to resolve a name just
because the person has since left.

The pré-facturier's own "pending" list needed no code change: it is driven entirely by `Cra` rows
that already exist for the requested period (`preFacturierComposition`, `unit.cras.list`), not by
enumerating the office roster and asking who has not submitted yet. The domain invariant above
already guarantees no `Cra` can exist for a departed consultant's period after they left, so the
composition cannot show one — the reader-level fix and the domain-level fix cover two genuinely
different reads rather than needing to duplicate one rule in two places.

Existing `manager_attachments` and `assignments` rows already carry a `toDate` — a departure closes
both of a departing consultant's open rows to keep the seed internally coherent (item 6's own
requirement), which is a seed-time concern and not a schema or domain change this ADR owns.

## Rejected option

**A boolean `active` flag instead of a date.** Rejected because it throws away exactly the
information the invariant needs: "a `Cra` cannot exist for a period that starts after the
consultant left" cannot be checked against a boolean, only against a date to compare a period's
start to. A flag would need a _second_ column for the date anyway, at which point it is this
decision with a redundant field.

**Deleting the row** the day someone leaves. Rejected outright: `public.consultants.id` is
referenced by `cra.consultant_id`, `invoice_lines`, `manager_attachments`, and `assignments` — a
delete would either cascade into deleting invoiced history (violating "a validated CRA is
immutable" more thoroughly than a code bug ever could) or be blocked by every one of those foreign
keys, and working around the block would be building this ADR's own column by another name, with
none of its safety.

## Reconsideration threshold

**The day a departure has to be reversible**, or **a re-hire needs to keep one identity** — a
consultant who left and later returned, where the firm wants their old id, old historical CRAs, and
old invoices attached to a _second_ tenure rather than treated as a fresh row. A single nullable
date cannot represent two tenures; that day, this becomes a small table of date ranges
(`consultant_tenures`, one row per period of employment) rather than one column, and every reader
above that reads `departure_date IS NULL` today reads "is there an open-ended tenure row" instead.

## Consequences

**Easy.** One column, defaulting to `NULL` for every existing row; one guard in the one place a
`Cra` comes into existence; one reader narrowed by one clause. The negative test this ADR owes
(`cra.test.ts`, "Cra.open and a consultant departure") is a pure domain test, no database needed,
following the same pattern every other guard in `packages/timesheet/src/domain/errors.ts` already
has a test for.

**Expensive.** `Cra.open`'s signature grew a required field, which touched every call site in the
repository (`apps/api/src/chain/record-month.ts`, `scripts/seed.ts`, two test fixtures) — a
one-time cost, paid once here, for the property that a caller cannot forget to think about
departure by omission. `scripts/seed.ts`'s own dense-month loop passes `null` unconditionally today
(no departed consultant carries a June 2026 CRA in that loop by construction); the seed's
historical-CRA loop, once it exists, is where a real per-consultant departure date first reaches
this guard under load — that call site is not yet written as of this ADR.
