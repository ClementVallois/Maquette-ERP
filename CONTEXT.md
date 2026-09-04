# CRA → Invoice

The domain of a French cybersecurity consulting firm, narrowed to one chain: a consultant records worked days, a manager validates that record, and the validation produces a draft invoice.

## Language rule

Code, comments, commits and ADRs are English. **French business terms stay French when translating them loses contractual or legal meaning** — they are the firm's ubiquitous language, not an accident. Every other term is English. Each entry below states which side it falls on and why.

## Records of time

**Cra** (🇫🇷 kept):
The monthly record of a consultant's worked days. Kept in French: "timesheet" drops the legal weight the _compte rendu d'activité_ carries as a record of working time.
_Avoid_: Timesheet, TimeSheet, ActivityReport

**CraLine**:
Part of one day of a `Cra`: a count of `QuarterDays`, the day type the consultant recorded — `worked` or `absence`, never `weekend` or `publicHoliday`, which the `WorkingCalendar` already knows — and, when worked, the `Mission` it was worked on. A day carries several lines when it is split between two missions, which is why the mission sits on the line and not on the day.
_Avoid_: Entry, TimeEntry

**CraStatus**:
Where a `Cra` sits between the consultant's keyboard and the invoice: `Draft`, `Submitted`, `Validated`, `Refused` — the four entries that follow, and the only four (ADR-0005). Only `Validated` is immutable, and that distinction is the whole point of having states.
_Avoid_: State, Stage, Step

**Draft**:
A `Cra` the consultant is still filling in. Saves as they type; nobody else acts on it.
_Avoid_: Open, InProgress, New

**Submitted**:
A `Cra` the consultant has handed to their manager. No longer editable by the consultant, not yet final.
_Avoid_: Pending, AwaitingApproval, Sent

**Validated**:
A `Cra` the manager has accepted. Immutable, and the only status that produces an invoice.
_Avoid_: Approved, Accepted, Closed, Locked

**Refused**:
A `Cra` the manager has sent back, with a reason the consultant can act on. Editable again, and resubmittable; the refusal is dropped when it is resubmitted, so no `Cra` awaiting validation carries a stale one. The one non-terminal answer a manager can give (ADR-0005).
_Avoid_: Rejected, Denied, Returned

**Period**:
The month a `Cra` covers, written `YYYY-MM`. Every dated rule of the chain resolves against a day inside the period — the manager who validates March's `Cra` is March's manager, the `Tjm` applied is the one in force in March — never against the day the screen was opened.
_Avoid_: Month, Range, Interval

**QuarterDays**:
A count of quarter-days: the single unit in which worked time is recorded, stored and transported (ADR-0069, superseding the half-day of ADR-0012). Never hours, never a fraction of a day. A full day is four quarter-days, which is what keeps `Tjm ÷ 4` exact in integer cents.
_Avoid_: Days, Duration, Hours, Workload, HalfDays

**DayType**:
What a calendar day counts as for a consultant: worked, absence, public holiday, weekend. Only worked days reach an invoice.
_Avoid_: Category, Kind

**CraFlag**:
A day of a `Cra` that carries an entry although the `WorkingCalendar` says it is not workable — a worked Saturday, a worked public holiday. Computed at submission and carried to the manager, who decides. It is not a refusal: weekend work happens in this business, and refusing it only teaches consultants to record it on the Monday.
_Avoid_: Warning, Anomaly, Exception, Alert

**LateDays**:
Quarter-days recorded on a `Cra` whose `Period` has closed and whose `CraStatus` is not `Validated` — work delivered that the chain cannot invoice yet (ADR-0054). Counted in quarter-days like everything else, summed over the `Cra`s the actor may read, and zero for the month still running: nothing recorded this month is late, because nothing this month is due. It is deliberately **not** a count of days elapsed past a deadline — this mockup has no submission deadline and inventing one would put a fabricated obligation on a screen.
_Avoid_: Overdue, Backlog, Pending, Delay, Retard

**WorkingCalendar**:
The authority on which dates are workable in France (Europe/Paris, weekends, public holidays). Not a utility: it decides what may be billed.
_Avoid_: Holidays, DateUtils

## Commercial shape

**Mission** (🇫🇷/🇬🇧 identical):
A body of work sold to a client, staffed with consultants and billed under one `BillingModel`. Each module holds only the projection its own rules read (ADR-0031): in `timesheet` a `Mission` is staffing dates and nothing else, in `billing` it is commercial terms and nothing else. Same identifier, same word, two types — a mission as staffing and a mission as a commercial object are not the same object.
_Avoid_: Project, Engagement, Contract

**Assignment** (🇬🇧 translated from _affectation_):
The dated staffing of a `Consultant` on a `Mission`: from when, until when. Translates without loss. Dated because a consultant moves mid-month — what may be recorded on the 3rd is not what may be recorded on the 25th — and both bounds are inclusive, so a mission worked on its last day is recorded on its last day.
_Avoid_: Staffing, Allocation, Booking

**BillingModel**:
How a `Mission` converts work into revenue. Two values, both kept French.
_Avoid_: PricingModel, ContractType

**Regie** (🇫🇷 kept):
Time-and-materials billing: days actually worked × `Tjm`. The only model this mockup invoices. Kept in French: _régie_ and _time-and-materials_ are not the same contractual object under French law.
_Avoid_: TimeAndMaterials, TAndM, Hourly

**Forfait** (🇫🇷 kept):
Fixed-price billing: an agreed amount for an agreed deliverable, independent of days worked. Present in the dataset, never invoiced here. Kept in French for the same reason as `Regie`.
_Avoid_: FixedPrice, Package, Fixed

**Client** (🇫🇷/🇬🇧 identical):
The party an `Invoice` is addressed to, reduced to what issuing one requires: who to address, where, its SIREN, its intra-EU VAT number and its `Territoriality`. No contacts, no pipeline, no account manager — an ERP holds all of that and none of it decides a rate or a mandatory mention. The SIREN carries a Luhn check digit, so a client with a nine-digit number that is not a SIREN is refused rather than printed on a legal document.
_Avoid_: Customer, Account, Company, Party

**Territoriality** (🇬🇧 translated from _territorialité_):
Where a `Client` is established, and the only client attribute the fiscal rules read: metropolitan France, an overseas department where VAT applies (Guadeloupe, Martinique, La Réunion), an overseas department outside the scope of VAT (Guyane, Mayotte, art. 294-1 CGI), or another European Union country. Four values because each carries a different mandatory mention, not because each carries a different number (ADR-0010).
_Avoid_: Region, Country, Zone, TaxRegion

**ServiceNature**:
What is being sold, as the VAT rules see it. One value here — a consulting service — and an input to the rate resolution rather than an assumption baked into it (ADR-0010): a training course, a resold licence and a work on a building each resolve differently, and collapsing the input makes the rate look like a property of the `Client`.
_Avoid_: Kind, ProductType, Category

**Tjm** (🇫🇷 kept):
_Taux journalier moyen_ — the daily rate agreed with the client for a consultant on a mission. Kept in French: it is the term written into the contract and opposable to the client. Always a **whole number of euros**, and dated: work done in June bills at June's `Tjm`. The whole-euro premise is what keeps quarter-day billing exact in integer cents (ADR-0002, ADR-0010, ADR-0069).
_Avoid_: DailyRate, Rate, Price

## People and reach

**Consultant**:
A person who records a `Cra` and may be staffed on a `Mission`.
_Avoid_: Employee, User, Resource

**Departure**:
The nullable date a `Consultant` left the firm (`public.consultants.departure_date`, ADR-0079). `NULL` means still with the firm — the column's own default, so an existing row needs no backfill. Translates without loss, so it is English like `Office` and `Practice`, not kept French like `Intercontrat` or `Habilitation`. A departure erases nothing: it removes the consultant from a manager's _current_ roster and the pré-facturier's pending list, while every `Cra` and `Invoice` already on their name stays readable. The one invariant it carries is in the domain, not only in this column: a `Cra` cannot be opened for a period that starts after the departure (`Cra.open`, `CraAfterDepartureError`).
_Avoid_: Active flag, Termination, Offboarding, Deletion

**Roster**:
The set of `Consultant`s a `Manager` may read: their own `Office`'s consultants, excluding the manager asking and anyone whose `Departure` has passed (`GET /api/v1/consultants`, ADR-0077). It is a read, never a stored list — the membership is derived from `office_id` and `departure_date` every time, so there is nothing to keep in step. It names an office's people, not a project's: who is staffed on a `Mission` is an `Assignment`.
_Avoid_: Team, Headcount, Directory, Staff list

**OrgChart** (displayed as _Mon équipe_):
The people immediately around one `Consultant` in the reporting hierarchy, as one read
(`GET /api/v1/org-chart`, ADR-0090): their own manager (N+1), and — for a `Manager` — the reports
they may act on (N-1). Not a synonym for `Roster`, which is an `Office`'s whole consultant list
regardless of who manages whom, nor for `ManagerAttachment`, which is one dated link between two
people. It is the **intersection** of the two, narrowed once more by `Departure`: an office's
current consultants who report to the asker today. Derived on every read, never stored. Both
`Roster` and `ManagerAttachment` list _Team_ under their own _Avoid_, and this entry is why the
concept has its own word instead of borrowing that one.
_Avoid_: Team, Reporting line, Hierarchy view, Direct reports (as a noun for the whole read)

**CSE** (🇫🇷 kept — _comité social et économique_):
The French works council, whose notices are one of the message kinds the dashboard's company-news
module carries (`features/dashboard/company-news.ts`). Statutory, and untranslatable without loss:
"works council" names a different body under a different law. It is demonstration content only —
nothing in the domain reads it, there is no editor, and the messages are a fixed list in the
front-end.
_Avoid_: Works council, Staff committee, Intranet news

**Veteran**:
A `Consultant` seeded with a sparse `Cra` history reaching back to 2016, as opposed to one holding only the dense recent months (`HISTORICAL_VETERANS`, `scripts/lib/seed-data.ts`). A fixture term, not a business one: the firm grants a veteran nothing, and no rule anywhere reads it. It exists so the dataset can exercise a decade of periods, an extended `Mission` and a `Departure` without inventing a second client base (ADR-0080).
_Avoid_: Senior (a `Grade`), Historical consultant, Legacy consultant

**Practice** (🇬🇧 translated from _pôle_):
An area of expertise the firm sells: audit, SOC, GRC, IAM, offensive security. Translates without loss.
_Avoid_: Pole, Department, Team, BusinessUnit

**Office** (🇬🇧 translated from _implantation_):
A geographic site of the firm: Paris, Lyon, Rennes, Bordeaux. Translates without loss. Carries authorization scope — a manager reads their own office, not another's.
_Avoid_: Site, Location, Branch, Agency

**ManagerAttachment**:
Who a `Consultant` reported to, between which dates. Dated, and read against the month rather than against today: the `Cra` of March is accepted by the manager of March, even when it is validated in July and the consultant has since changed team (ADR-0034). A month resolves at its close — the manager in place when it ended.
_Avoid_: Reporting line, Team, Supervisor

**Grade**:
A named seniority level of a consultant: Junior, Confirmed, Senior, Principal. A grade carries a default `Tjm` grid (the starting point for pricing a mission) and a ranked ordering. A consultant's grade assignment is dated and carries the `Cjm`.
_Avoid_: Level, Rank, Seniority, Title

**Cjm** (🇫🇷 kept):
_Coût journalier moyen_ — the average daily cost of a consultant to the firm. Kept in French because it is the partner to `Tjm` in the firm's margin vocabulary and changing one without the other breaks the pair. Whole euros, like `Tjm`. This is the sensitive value the authorization model protects: a consultant's cost is visible only to their own office's management, and the scope test proves it.
_Avoid_: DailyCost, CostRate, InternalRate

**Intercontrat** (🇫🇷 kept):
A consultant currently on no **client** mission. Kept in French: "bench" describes a different employment reality and has no French-law equivalent. **Modelled as an internal `Forfait` mission named `Intercontrat`**, sold by the firm to itself, that the consultant is assigned to (ADR-0046) — so their days are recorded like anyone's, the completeness rule stays absolute, and the days are declined as `notRegie` by ADR-0037 instead of being billed. There is no `DayType` for it and no consultant with no assignment: "staffed on nothing" is a fact about staffing, and the mission dimension is where it lives.
_Avoid_: Bench, Idle, Unassigned, Available

**Habilitation** (🇫🇷 kept):
A certification-backed clearance a consultant must hold to be staffed on a given mission. Kept in French: distinct from both _role_ and _permission_, and the word used in the firm's own audit vocabulary.
_Avoid_: Clearance, Certification, Qualification

**Passi** (🇫🇷 kept):
_Prestataire d'audit de la sécurité des systèmes d'information_ — an ANSSI qualification. A proper noun; never translated.
_Avoid_: SecurityAuditQualification

**Role**:
What a person is allowed to do in the CRA-to-invoice chain: `consultant` records and submits, `manager` validates and reads margins, `billing` issues the numbered document. Three values, and they are **not** the firm's org-chart roles — the seed writes `consultant | manager | director` on a `Consultant`, which is an HR fact the authorization model never reads (ADR-0023). A `Role` is always exercised inside one `Office`: scope and role are two dimensions, never one.
_Avoid_: Permission, Profile, Group, AccessLevel

**Persona**:
One of the four selectable identities the mockup offers instead of authentication — a named pairing of a `Consultant` with a `Role`, seeded as reference data and chosen explicitly. It is called a persona and not a user because nothing about it is authenticated: anyone may select any of them, and the README says so. Two personas share the `manager` role in different offices, which is what makes an out-of-scope refusal something a reader can reproduce rather than be told about.
_Avoid_: User, Account, Login, Profile, Impersonation

**Actor**:
The `Role` and the `Office` a request acts under, together with the `Consultant` it acts as — the three fields every authorization decision reads (ADR-0023). It is on both modules' public ports, and it is deliberately **not** a `Persona`: a persona is a selectable identity in a catalogue and a fact about this mockup's front door, while an actor is what a request carries once one has been selected. The modules know the second and must never learn the first.
_Avoid_: User, Principal, Subject, CurrentUser, Identity

**Session** (transport only, never a stored thing):
The word on the HTTP surface — `GET /api/v1/session`, `SESSION_SIGNING_KEY` — and it names **no** record: ADR-0023 § Decision says "no session store", and there is none. The route reports which `Persona` the request currently carries, and the signing key exists so the persona cookie cannot be forged into one the caller was never offered. It is listed here because it is published on the wire and a reader will meet it; the domain term for the thing behind it is `Persona`, and nothing in `packages/` uses this word.
_Avoid_: using it for anything server-side — there is no session state, no expiry, no store

## Money out

**Invoice** (🇬🇧 translated from _facture_):
A demand for payment issued to a client, derived from validated `Cra` days on a `Regie` mission. Translates without loss. Once issued it is immutable.
_Avoid_: Bill, Facture

**InvoiceLine**:
One line of an `Invoice`, frozen at the moment it is drafted. Carries its quantity in `QuarterDays` and its unit price per quarter-day — so no quantity is ever a decimal — the daily rate that applied, **copied** rather than referenced, its `VatTreatment`, and its origin.
_Avoid_: LineItem, Item, Ligne

**RegieDays**:
The origin of an `InvoiceLine` that came from validated `Cra` days on a `Regie` mission: the mission, the `Cra`, the month worked, the count of `QuarterDays` and the `Tjm` in force then. The only origin this mockup produces, and a tagged one from the first line written (ADR-0013) — a second origin is a variant, not a migration over documents that are legally immutable. It is also what makes the CRA → line → invoice chain checkable rather than claimed.
_Avoid_: Source, Reference, Provenance

**Pré-facturier** (🇫🇷 kept):
The screen that answers, for one `Period` and one `Office`, what is billable and — for every quarter-day that is not — why. Kept in French: it is the name the firm's finance people use for the pre-invoicing review, and "draft invoice list" describes a table rather than the monthly act of checking one. It is a **view and never a writer**: nothing is decided on it, and the two things it shows come from two modules that never meet in a query (ADR-0053). What blocks a quarter-day is either a `DeclinedDays` reason (the `Cra` was validated and the day still produced no line) or the `CraStatus` itself, which is what `LateDays` counts.
_Avoid_: PreBilling, DraftInvoices, BillingReview, Prefacturation

**Piste d'audit fiable** (🇫🇷 kept):
The reliable audit trail French tax law requires between a delivered service and the invoice that bills it (art. 289-VII du CGI): a documented, permanent and chronological link, each step tied to the one before. Kept in French because "audit trail" in English is a logging term and loses the legal obligation entirely — this is the reason the phrase is the load-bearing one in ADR-0013 and ADR-0020 rather than decoration. Here it is materialised by two things and not by a claim: an `InvoiceLine` carries its `RegieDays` origin down to the `Cra` it came from, and every domain event is written to `domain_events` in **the same transaction** as the change that emitted it, carrying its `correlationId` and `causationId`.
_Avoid_: AuditTrail, AuditLog, Traceability, Journal

**CreditNote** (🇬🇧 translated from _avoir_):
The document that corrects an issued `Invoice`, since an issued invoice is never modified. Standard accounting term, exact translation. It reverses the invoice **in full** — a partial one is not built here — carries **positive** amounts with its own type carrying the direction (ADR-0036), takes its number from the same series as the invoice (ADR-0018), and says why in a typed `CreditNoteReason`: an entry error, a commercial gesture, a scope dispute, or a cancellation. It has no lifecycle: it is issued in one act and never changes.
_Avoid_: Avoir, Refund, Reversal, Credit

**VatTreatment**:
How VAT applies to one `InvoiceLine`, resolved from the operation and then frozen onto the line (ADR-0010). Either a rate — an integer number of basis points, so 8,5 % is 850 and never 0.085 (ADR-0035) — or the statement that no French VAT is charged, with the reason why. The two are different shapes and not different numbers: a rate of 0 % and an operation outside the scope of the tax print different mandatory mentions and are declared differently.
_Avoid_: TaxRate, Vat, TvaRate

**Autoliquidation** (🇫🇷 kept):
The reverse charge: on a service sold to a VAT-registered business in another EU member state, the customer accounts for the tax and the invoice carries no French VAT. Kept in French because it is the word the invoice is legally required to print (art. 283-2 du CGI).
_Avoid_: ReverseCharge, SelfAssessment

**BilledParty**:
The `Client` **as the document states it**, copied at drafting and never read back. Distinct from `Client` on purpose, and the distinction is the documentary freeze: if the client moves office, the invoice already sent keeps the address it was sent to. Carries the delivery address the reform makes mandatory, falling back to the billing address by holding it rather than by leaving a blank.
_Avoid_: Customer, Recipient, Buyer

**PaymentTerms** (🇬🇧 translated from _conditions de règlement_):
When the client has to pay, in one of the two forms French law allows between businesses: so many days from the invoice date, or so many days end of month. Capped at 60 and 45 respectively — an agreed term above the cap is void, not unusual, so it is refused rather than printed (art. L441-10 du code de commerce). Translates without loss.
_Avoid_: Terms, DueDays, Delay

**EarlyPaymentDiscount** (🇬🇧 translated from _escompte_):
The reduction offered for paying before the due date. A mandatory mention **even to say there is none**, which is why "none" is a value of the type and not a missing field: the model cannot represent an invoice that forgot to say it.
_Avoid_: Discount, Rebate, Escompte

**OperationCategory**:
What an invoice covers in the reform's terms — a supply of services, of goods, or both. Consulting days are services. A mandatory field of an electronic invoice, and one that decides which VAT date rules apply, so it is carried on the document rather than assumed.
_Avoid_: Type, Nature, Kind

**DeclinedDays**:
Quarter-days a validated `Cra` carried that did **not** become an `InvoiceLine`, with the reason: the mission is not `Regie`, the mission is unknown to billing, no `Tjm` was agreed for that date, or the client is missing. Reported rather than skipped (ADR-0037) — every quarter-day the validation carried is in either the invoices or this list, and a day that vanishes between validation and invoicing is the discrepancy this whole chain exists to remove.
One row of it — the quarter-days one `Mission` on one `Cra` declined, for one reason — is a **`DeclinedDaysRecord`** on the repository port and in `billing.declined_days`. The two names are one term: the plural is the concept, the record is a row of it.
_Avoid_: Skipped, Ignored, Rejected, Errors

**CraAlreadyProcessedError**:
The refusal returned when a `Cra` that has already produced a draft invoice for a client is processed again. A **business** error and not a technical one: replaying a `timesheet.TimesheetValidated` event is expected — at-least-once delivery, a retried request, a manual replay — and the right answer is a named refusal, not a second invoice and not a crash. Enforced twice on purpose (ADR-0021): a unique constraint in the draft table, and the domain guard in front of it, so the invariant does not rest on the database alone. Rendered as a `409 Conflict` since Phase 5 put an API in front of it (`apps/api/src/http/problem.ts`), and named in French on a screen since Phase 6 (ADR-0060).
_Avoid_: DuplicateInvoice, AlreadyBilled, ConflictError

**InvoiceNumber**:
The legal, sequential and gapless identifier of an issued `Invoice` or `CreditNote`, allocated from one series keyed on the issuing entity and the fiscal year (ADR-0018). Written `SEC-2026-000042`. Distinct from the document's internal id, and carrying no mark of which of the two kinds of document it numbers — the kind is the document's, and the number's job is chronological continuity.
_Avoid_: Reference, Id, Sequence

**InvoiceStatus**:
Where an `Invoice` sits: `draft` while it is being assembled, `issued` once it has a number and a date and has left, `cancelledByCreditNote` once a `CreditNote` has reversed it. Three, and only three. There is no `paid`, no `sent` and no `overdue`: this mockup issues nothing and collects nothing, and a status a screen would set but no rule would read is a lie in an enum.
_Avoid_: State, InvoiceState, Stage

**Issued**:
An `Invoice` that has left: it has a number from the series, a date, and frozen totals. Immutable from that moment — the only correction is a `CreditNote`.
_Avoid_: Sent, Final, Validated, Emitted

**CancelledByCreditNote**:
An `Invoice` a `CreditNote` has reversed in full. The invoice itself is untouched — it keeps its number, its lines and its totals, because an issued invoice is never modified; the status records that another document now cancels it.
_Avoid_: Credited, Cancelled, Voided, Reversed
