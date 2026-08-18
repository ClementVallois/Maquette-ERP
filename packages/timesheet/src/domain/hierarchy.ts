import { type IsoDate, lastDayOf, type Period, type Timeline, timeline } from '@erp/platform';

import type { ConsultantId } from './ids.ts';

/**
 * Who a consultant reported to, between which dates. Dated because people change teams: the Cra
 * of March is accepted by March's manager even when it is validated in June by which time the
 * consultant has moved (ADR-0034).
 */
export interface ManagerAttachment {
  readonly consultantId: ConsultantId;
  readonly managerId: ConsultantId;
  readonly from: IsoDate;
  readonly to: IsoDate | null;
}

export interface Hierarchy {
  /** The manager on a given day, or `null` when nobody was attached to the consultant then. */
  managerOn(consultantId: ConsultantId, date: IsoDate): ConsultantId | null;
  /** The manager who accepts a whole month: the one in place when the month closed. */
  managerOf(consultantId: ConsultantId, target: Period): ConsultantId | null;
}

export function hierarchy(attachments: readonly ManagerAttachment[]): Hierarchy {
  const perConsultant = new Map<ConsultantId, Timeline<ConsultantId>>();

  for (const attachment of attachments) {
    const own = attachments.filter((other) => other.consultantId === attachment.consultantId);
    perConsultant.set(
      attachment.consultantId,
      // Building it per consultant is what makes the overlap check mean something: two managers
      // for two different people on the same day is normal, two for one person is not.
      timeline(own.map(({ from, to, managerId }) => ({ from, to, value: managerId }))),
    );
  }

  const resolved: Hierarchy = {
    managerOn(consultantId, date) {
      return perConsultant.get(consultantId)?.at(date) ?? null;
    },

    managerOf(consultantId, target) {
      return resolved.managerOn(consultantId, lastDayOf(target));
    },
  };

  return resolved;
}
