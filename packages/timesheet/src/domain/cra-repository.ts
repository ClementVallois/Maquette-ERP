import type { Period } from '@erp/platform';

import type { Cra } from './cra.ts';
import type { ConsultantId, CraId, OfficeId } from './ids.ts';

export interface CraListItem {
  readonly id: CraId;
  readonly consultantId: ConsultantId;
  readonly officeId: OfficeId;
  readonly period: string;
  readonly status: string;
}

export interface CraListQuery {
  readonly officeId: OfficeId;
  readonly limit: number;
  readonly offset: number;
}

export interface CraRepository {
  findById(id: CraId, actor: { officeId: OfficeId }): Promise<Cra | null>;
  list(query: CraListQuery): Promise<readonly CraListItem[]>;
  findByConsultantAndPeriod(
    consultantId: ConsultantId,
    period: Period,
    actor: { officeId: OfficeId },
  ): Promise<Cra | null>;
  save(cra: Cra): Promise<void>;
}
