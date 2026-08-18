import { type IsoDate, InvalidValueError, type Timeline, timeline } from '@erp/platform';

import type { Client } from './client.ts';
import type { ClientId, MissionId } from './ids.ts';

/**
 * How a mission converts work into revenue. Only `Regie` is invoiced by this mockup; `Forfait` is
 * in the dataset and its days are not billed here (ADR-0037).
 */
export const BILLING_MODELS = ['Regie', 'Forfait'] as const;

export type BillingModel = (typeof BILLING_MODELS)[number];

/**
 * What `billing` knows about a mission: its commercial terms. Not who is staffed on it, not when
 * it runs — `timesheet` holds that side, and the two never import each other (ADR-0031). Same
 * identifier, same word, two types, because a mission as staffing and a mission as a commercial
 * object are not the same object.
 */
export interface CommercialMission {
  readonly id: MissionId;
  readonly clientId: ClientId;
  readonly billingModel: BillingModel;
  /**
   * The agreed daily rate over time, in integer cents. Dated because a rate is renegotiated:
   * work done in June bills at June's rate whatever today's is (ADR-0034).
   */
  readonly tjmCents: Timeline<number>;
}

/**
 * The reference data an invoice is drafted against, as a snapshot handed to the domain rather
 * than a port it calls — the domain performs no I/O, and drafting is a pure function of the event
 * and the reference at that instant. The same shape `timesheet` uses, for the same reason.
 */
export interface BillingReference {
  mission(id: MissionId): CommercialMission | null;
  client(id: ClientId): Client | null;
  /** The rate in force on a given day, or `null` when none was agreed then. */
  tjmCentsOn(id: MissionId, date: IsoDate): number | null;
}

export function commercialMission(input: {
  id: MissionId;
  clientId: ClientId;
  billingModel: BillingModel;
  tjmCents: readonly { from: IsoDate; to: IsoDate | null; value: number }[];
}): CommercialMission {
  for (const entry of input.tjmCents) {
    if (!Number.isSafeInteger(entry.value) || entry.value <= 0) {
      throw new InvalidValueError(
        'mission.tjmCents',
        entry.value,
        'a whole number of cents above zero',
      );
    }
    // The premise of `lineAmountCents`, checked where the rate enters rather than where it is
    // divided: a Tjm is a whole number of euros (ADR-0002), so it is even.
    if (entry.value % 2 !== 0) {
      throw new InvalidValueError('mission.tjmCents', entry.value, 'an even number of cents');
    }
  }

  return {
    id: input.id,
    clientId: input.clientId,
    billingModel: input.billingModel,
    tjmCents: timeline(input.tjmCents),
  };
}

export function billingReference(input: {
  missions: readonly CommercialMission[];
  clients: readonly Client[];
}): BillingReference {
  const missions = new Map(input.missions.map((mission) => [mission.id, mission]));
  const clients = new Map(input.clients.map((entry) => [entry.id, entry]));

  return {
    mission(id) {
      return missions.get(id) ?? null;
    },

    client(id) {
      return clients.get(id) ?? null;
    },

    tjmCentsOn(id, date) {
      return missions.get(id)?.tjmCents.at(date) ?? null;
    },
  };
}
