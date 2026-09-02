import type { Actor } from '@erp/platform';

import type { DeclineReason } from './declined-days.ts';
import type { CraId, InvoiceId, MissionId, OfficeId } from './ids.ts';
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
  list(query: InvoiceListQuery): Promise<readonly InvoiceListItem[]>;
  /**
   * `issuanceIdempotencyKey` is written only by an issuance, and only once: the unique index in
   * migration 009 is what makes a retry visible rather than a second numbered document (ADR-0044).
   */
  save(invoice: Invoice, options?: { issuanceIdempotencyKey: string }): Promise<void>;
  /** The document a previous issuance already produced under this key, if this actor may see it. */
  findIssuedWithKey(key: string, actor: Actor): Promise<InvoiceListItem | null>;
  saveDraft(invoice: Invoice, craId: string): Promise<void>;
  /**
   * Internal invariant check — returns whether any invoice has already been drafted from this CRA.
   * Not office-scoped: it is a boolean, exposes no data, and scoping it would let a replayed event
   * draft duplicates in another office's transaction (ADR-0021).
   */
  hasCraBeenProcessed(craId: string): Promise<boolean>;
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
