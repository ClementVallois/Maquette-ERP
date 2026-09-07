import type { Actor } from '@erp/platform';

import type { DeclineReason } from './declined-days.ts';
import type { CraId, InvoiceId, MissionId, OfficeId } from './ids.ts';
import type { InvoiceStatus } from './invoice-status.ts';
import type { Invoice } from './invoice.ts';

export interface InvoiceListItem {
  readonly id: InvoiceId;
  readonly status: string;
  readonly supplyPeriod: string;
  readonly billedToName: string;
  readonly invoiceNumber: string | null;
  readonly issueDate: string | null;
  /**
   * A draft's TTC is computed from its lines, not stored — issuing can still change them, so
   * `totalsAreProvisional` (true for every draft) is what tells a reader this number is not yet
   * frozen. Never null: a draft's computed total stands in for the absent frozen one.
   */
  readonly totalTtcCents: number | null;
  readonly totalsAreProvisional: boolean;
}

export interface InvoiceListQuery {
  readonly actor: Actor;
  readonly limit: number;
  readonly offset: number;
  /**
   * One supply period, or every one. Pushed into the query rather than applied to a capped page
   * (ADR-0053): filtering after the cap silently drops rows the moment an office holds more than
   * a page of invoices across all months.
   */
  readonly period?: string;
  readonly status?: InvoiceStatus;
  readonly year?: number;
  /** Case-insensitive client-name or legal-number search. */
  readonly search?: string;
}

/** A row of the pré-facturier's blocking-reason column: days that produced no line (ADR-0037). */
export interface DeclinedDaysRecord {
  readonly craId: CraId;
  readonly missionId: MissionId;
  readonly quarterDays: number;
  readonly reason: DeclineReason;
}

/**
 * Rank A2's chart: how many invoices of each status exist per supply-period year. `year` is the
 * four-digit prefix of `supply_period` (`YYYY-MM` text — migration 002's own comment on why it is
 * text, not a date), the same convention `CraListQuery.year` already reads against.
 */
export interface InvoiceYearStatusCount {
  readonly year: string;
  readonly status: string;
  readonly count: number;
}

export interface InvoiceRepository {
  /**
   * `null` means there is no such invoice; an invoice that exists and is out of reach raises
   * `OutOfScopeError` (ADR-0003, ADR-0023).
   */
  findById(id: InvoiceId, actor: Actor): Promise<Invoice | null>;
  /**
   * Serialize one issuance key and lock the target invoice before returning its current state.
   * `keyOwnerId` is global because the database uniqueness constraint is global too.
   */
  prepareIssuance(
    id: InvoiceId,
    idempotencyKey: string,
    actor: Actor,
  ): Promise<{ readonly invoice: Invoice | null; readonly keyOwnerId: InvoiceId | null }>;
  list(query: InvoiceListQuery): Promise<readonly InvoiceListItem[]>;
  /**
   * Rank A12: `list`'s own `WHERE`, minus `limit`/`offset` — what makes truncation observable
   * (`total` vs. the page length actually returned) instead of indistinguishable from "there were
   * exactly this many".
   */
  count(query: Omit<InvoiceListQuery, 'limit' | 'offset'>): Promise<number>;
  /**
   * Package 08: the exact sum of `totalTtcCents` over `count`'s own filter — never a page's own
   * arithmetic. Only an `issued` invoice has a frozen `totalTtcCents`; the caller decides which
   * statuses to include, the same way `count` already leaves that choice to its own caller.
   */
  sumTtcCents(query: Omit<InvoiceListQuery, 'limit' | 'offset'>): Promise<number>;
  /** Package 08: every distinct supply period visible to the actor, newest first; never derived from a page. */
  listPeriods(actor: Actor): Promise<readonly string[]>;
  /**
   * Package 08: the N oldest drafts across every period, sorted and limited in SQL rather than
   * filtered out of one page ordered newest-first — the defect the audit reproduced by name.
   * `sourceCraId` is the first Cra that produced this invoice, if any (ADR-0038: an invoice can
   * have several; the dashboard's own queue names one consultant per row).
   */
  oldestDrafts(
    actor: Actor,
    limit: number,
  ): Promise<readonly (InvoiceListItem & { readonly sourceCraId: CraId | null })[]>;
  /** Package 08: the N most recently issued invoices visible to the actor, sorted and limited in SQL. */
  recentIssued(actor: Actor, limit: number): Promise<readonly InvoiceListItem[]>;
  /**
   * `issuanceIdempotencyKey` is written only by an issuance, and only once: the unique index in
   * migration 009 is what makes a retry visible rather than a second numbered document (ADR-0044).
   */
  save(invoice: Invoice, options?: { issuanceIdempotencyKey: string }): Promise<void>;
  /**
   * The document a previous issuance already produced under this key, if this actor may see it.
   * Read side only — issuance itself goes through `prepareIssuance`, which is not office-scoped.
   */
  findIssuedWithKey(key: string, actor: Actor): Promise<InvoiceListItem | null>;
  saveDraft(invoice: Invoice, craId: string): Promise<void>;
  /**
   * The invoices already drafted from this Cra. ADR-0021's contract is "replay → original result,
   * not rejection", and a boolean cannot return the original result — this is what lets a replayed
   * validation answer with the documents the first one produced.
   */
  findDraftedFrom(craId: string, actor: Actor): Promise<readonly InvoiceListItem[]>;
  /** Idempotent by `(craId, missionId, reason)`: replaying a validation appends no second copy. */
  saveDeclinedDays(officeId: OfficeId, declined: readonly DeclinedDaysRecord[]): Promise<void>;
  /**
   * Several `Cra`s at once, because the pré-facturier asks about a month and a month is not
   * `billing`'s to know (ADR-0053): the composition root resolves the period into ids and hands
   * them over. Each record names its own `craId`, so one query answers the whole page. An empty
   * set answers nothing — never everything.
   */
  findDeclinedDays(craIds: readonly string[], actor: Actor): Promise<readonly DeclinedDaysRecord[]>;
  /** Rank A2: one row per (year, status) this office's invoices span — the dashboard's history chart. */
  countByYearAndStatus(actor: Actor): Promise<readonly InvoiceYearStatusCount[]>;
}
