# CRA → Invoice

The domain of a French cybersecurity consulting firm, narrowed to one chain: a consultant records worked days, a manager validates that record, and the validation produces a draft invoice.

## Language rule

Code, comments, commits and ADRs are English. **French business terms stay French when translating them loses contractual or legal meaning** — they are the firm's ubiquitous language, not an accident. Every other term is English. Each entry below states which side it falls on and why.

## Records of time

**Cra** (🇫🇷 kept):
The monthly record of a consultant's worked days. Kept in French: "timesheet" drops the legal weight the _compte rendu d'activité_ carries as a record of working time.
_Avoid_: Timesheet, TimeSheet, ActivityReport

**CraLine**:
Part of one day of a `Cra`: a count of `HalfDays`, the day type the consultant recorded — `worked` or `absence`, never `weekend` or `publicHoliday`, which the `WorkingCalendar` already knows — and, when worked, the `Mission` it was worked on. A day carries several lines when it is split between two missions, which is why the mission sits on the line and not on the day.
_Avoid_: Entry, TimeEntry

**CraStatus**:
Where a `Cra` sits between the consultant's keyboard and the invoice. Only `Validated` is immutable — that distinction is the whole point of having states.
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

**Period**:
The month a `Cra` covers, written `YYYY-MM`. Every dated rule of the chain resolves against a day inside the period — the manager who validates March's `Cra` is March's manager, the `Tjm` applied is the one in force in March — never against the day the screen was opened.
_Avoid_: Month, Range, Interval

**HalfDays**:
A count of half-days: the single unit in which worked time is recorded, stored and transported (ADR-0012). Never hours, never a fraction of a day. A full day is two half-days, which is what keeps `Tjm ÷ 2` exact in integer cents.
_Avoid_: Days, Duration, Hours, Workload

**Refused**:
A `Cra` the manager has sent back, with a reason the consultant can act on. Editable again, and resubmittable; the refusal is dropped when it is resubmitted, so no `Cra` awaiting validation carries a stale one. The one non-terminal answer a manager can give (ADR-0005).
_Avoid_: Rejected, Denied, Returned

**DayType**:
What a calendar day counts as for a consultant: worked, absence, public holiday, weekend. Only worked days reach an invoice.
_Avoid_: Category, Kind

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

**Tjm** (🇫🇷 kept):
_Taux journalier moyen_ — the daily rate agreed with the client for a consultant on a mission. Kept in French: it is the term written into the contract and opposable to the client. Always a **whole number of euros**, and dated: work done in June bills at June's `Tjm`. The whole-euro premise is what keeps half-day billing exact in integer cents (ADR-0002, ADR-0010).
_Avoid_: DailyRate, Rate, Price

## People and reach

**Consultant**:
A person who records a `Cra` and may be staffed on a `Mission`.
_Avoid_: Employee, User, Resource

**Practice** (🇬🇧 translated from _pôle_):
An area of expertise the firm sells: audit, SOC, GRC, IAM, offensive security. Translates without loss.
_Avoid_: Pole, Department, Team, BusinessUnit

**Office** (🇬🇧 translated from _implantation_):
A geographic site of the firm: Paris, Lyon, Rennes, Bordeaux. Translates without loss. Carries authorization scope — a manager reads their own office, not another's.
_Avoid_: Site, Location, Branch, Agency

**Intercontrat** (🇫🇷 kept):
A consultant currently staffed on no mission. Kept in French: "bench" describes a different employment reality and has no French-law equivalent.
_Avoid_: Bench, Idle, Unassigned, Available

**Habilitation** (🇫🇷 kept):
A certification-backed clearance a consultant must hold to be staffed on a given mission. Kept in French: distinct from both _role_ and _permission_, and the word used in the firm's own audit vocabulary.
_Avoid_: Clearance, Certification, Qualification

**Passi** (🇫🇷 kept):
_Prestataire d'audit de la sécurité des systèmes d'information_ — an ANSSI qualification. A proper noun; never translated.
_Avoid_: SecurityAuditQualification

## Money out

**Invoice** (🇬🇧 translated from _facture_):
A demand for payment issued to a client, derived from validated `Cra` days on a `Regie` mission. Translates without loss. Once issued it is immutable.
_Avoid_: Bill, Facture

**CreditNote** (🇬🇧 translated from _avoir_):
The document that corrects an issued `Invoice`, since an issued invoice is never modified. Standard accounting term, exact translation.
_Avoid_: Avoir, Refund, Reversal, Credit

**InvoiceNumber**:
The legal, per-year, sequential and gapless identifier of an issued `Invoice`. Distinct from its internal id.
_Avoid_: Reference, Id, Sequence
