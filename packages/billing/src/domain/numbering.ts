import { type IsoDate, partsOf } from '@erp/platform';

import { InvalidSequenceError } from './errors.ts';
import type { LegalEntity } from './seller.ts';

/**
 * The number a document carries once it is issued: sequential, gapless, and shared by invoices and
 * credit notes (ADR-0018). This file holds the **shape** of the series and of the number; the
 * allocation that makes it gapless under concurrency is a locked row inside the issuing
 * transaction, and it is ADR-0007 in Phase 3.
 */

/**
 * What the counter is per. The entity is in the key although only one exists: a second entity
 * added to a series keyed on the year alone would renumber the whole history, and history is the
 * one thing a numbering series cannot be allowed to change.
 */
export interface SeriesKey {
  readonly entityId: string;
  /** The calendar year today. Named "fiscal" because the two part company the day it does. */
  readonly fiscalYear: number;
}

const SEQUENCE_DIGITS = 6;
const MAX_SEQUENCE = 10 ** SEQUENCE_DIGITS - 1;

export function seriesKeyOf(entity: LegalEntity, issueDate: IsoDate): SeriesKey {
  return { entityId: entity.id, fiscalYear: partsOf(issueDate).year };
}

export function sameSeries(left: SeriesKey, right: SeriesKey): boolean {
  return left.entityId === right.entityId && left.fiscalYear === right.fiscalYear;
}

/**
 * `SEC-2026-000042`. The number carries no mark of the kind of document: one series means one
 * counter, and a `FA-`/`AV-` prefix pair would be two series wearing one name.
 */
export function documentNumber(entity: LegalEntity, key: SeriesKey, sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new InvalidSequenceError(sequence, MAX_SEQUENCE);
  }

  return `${entity.numberPrefix}-${String(key.fiscalYear)}-${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}
