import type { Actor, Period } from '@erp/platform';

import type { CraStatus } from './cra-status.ts';
import type { Cra } from './cra.ts';
import type { ConsultantId, CraId, OfficeId } from './ids.ts';

export interface CraListItem {
  readonly id: CraId;
  readonly consultantId: ConsultantId;
  readonly officeId: OfficeId;
  readonly period: string;
  readonly status: string;
  /**
   * The quarter-days the Cra records, summed. A quantity and not a rate, so it does not reach the
   * line `Cjm`, `Tjm` and margin are held behind (BUILD-RULES § Authorization); it is here so the
   * pré-facturier can sum a month without fetching every Cra in full (ADR-0053).
   */
  readonly recordedQuarterDays: number;
  /**
   * When the current status was reached — submission for `submitted`, refusal for `refused`,
   * validation for `validated`. `null` for `draft` (never submitted) and for a legacy row this
   * column predates. Lets a work queue sort "awaiting a decision" oldest first without loading
   * every full `Cra` aggregate.
   */
  readonly statusChangedAt: string | null;
}

export interface CraListQuery {
  readonly actor: Actor;
  readonly limit: number;
  readonly offset: number;
  /**
   * One period, or every one. Pushed into the query rather than applied to a capped page
   * (ADR-0053), for the same reason as `InvoiceListQuery.period`: an office holding more than a
   * page of Cras across all months would otherwise see the month itself truncated.
   */
  readonly period?: string;
  /**
   * Item 7 (QA round 1): "for these three consultants, every CRA not yet validated" — both this
   * field and `statuses` below narrow *within* whatever `actor` may already see; neither can
   * widen it. The office boundary (and, for a consultant, the own-id boundary) is applied first
   * in the SQL, so a consultant id or a status outside the actor's scope answers an empty result,
   * never another office's row — `list` is filtered, not refused, and that holds here too.
   * `undefined`/an absent array means "every consultant/status the actor may see", matching
   * `period`'s own "one period, or every one".
   */
  readonly consultantIds?: readonly ConsultantId[];
  readonly statuses?: readonly CraStatus[];
  /**
   * Item 4 (QA round 2): "a year and/or month filter", independent of `period` above and of each
   * other — `year` alone narrows to every period in that calendar year, `month` alone to that
   * calendar month across every year, both together to the one `year-month` combination (the same
   * result `period` would give, reached a different way: a manager picking two dropdowns, not
   * typing a `YYYY-MM`). Narrows within `consultantIds`/`statuses` the same way those narrow
   * within the office boundary — never widens it. `undefined` means "every year"/"every month",
   * the same absence-reading every other optional field on this interface already uses.
   */
  readonly year?: number;
  readonly month?: number;
}

export interface CraRepository {
  /**
   * `null` means there is no such Cra. A Cra that exists and is out of the actor's reach raises
   * `OutOfScopeError` instead — ADR-0003 says the second beat of the demonstration is "a direct
   * API call refused with a 403 that names the rule that denied it", and a `null` names nothing.
   */
  findById(id: CraId, actor: Actor): Promise<Cra | null>;
  list(query: CraListQuery): Promise<readonly CraListItem[]>;
  /**
   * Rank A12: the same `WHERE` predicate `list` applies, minus `limit`/`offset` — what makes
   * truncation observable (`total` vs. the page length) and what a page-size selector's own
   * "1-50 sur 300" is built from. Never itself paginated: a count is one row, however large.
   */
  count(query: Omit<CraListQuery, 'limit' | 'offset'>): Promise<number>;
  findByConsultantAndPeriod(
    consultantId: ConsultantId,
    period: Period,
    actor: Actor,
  ): Promise<Cra | null>;
  save(cra: Cra): Promise<void>;
}
