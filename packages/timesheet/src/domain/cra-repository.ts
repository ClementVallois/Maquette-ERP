import type { Actor, Period } from '@erp/platform';

import type { Cra } from './cra.ts';
import type { ConsultantId, CraId, OfficeId } from './ids.ts';

export interface CraListItem {
  readonly id: CraId;
  readonly consultantId: ConsultantId;
  readonly officeId: OfficeId;
  readonly period: string;
  readonly status: string;
  /**
   * The half-days the Cra records, summed. A quantity and not a rate, so it does not reach the
   * line `Cjm`, `Tjm` and margin are held behind (BUILD-RULES § Authorization); it is here so the
   * pré-facturier can sum a month without fetching every Cra in full (ADR-0053).
   */
  readonly recordedHalfDays: number;
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
}

export interface CraRepository {
  /**
   * `null` means there is no such Cra. A Cra that exists and is out of the actor's reach raises
   * `OutOfScopeError` instead — ADR-0003 says the second beat of the demonstration is "a direct
   * API call refused with a 403 that names the rule that denied it", and a `null` names nothing.
   */
  findById(id: CraId, actor: Actor): Promise<Cra | null>;
  list(query: CraListQuery): Promise<readonly CraListItem[]>;
  findByConsultantAndPeriod(
    consultantId: ConsultantId,
    period: Period,
    actor: Actor,
  ): Promise<Cra | null>;
  save(cra: Cra): Promise<void>;
}
