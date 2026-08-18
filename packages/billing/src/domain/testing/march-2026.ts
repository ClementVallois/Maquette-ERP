import { period } from '@erp/platform';

import { type Client, client, type PostalAddress } from '../client.ts';
import { billingReference, type BillingReference, commercialMission } from '../reference.ts';

/**
 * The month every test of this module works in, and the two clients that make the fiscal rules
 * say something: one in Paris on the metropolitan rate, one in La Réunion on 8,5 %. March 2026 is
 * the month `timesheet`'s fixtures validate, so the two halves of the chain line up.
 */
export const MARCH = period(2026, 3);

export const REGIE_MISSION = 'mission-audit-passi';
export const FORFAIT_MISSION = 'mission-grc-forfait';
export const OVERSEAS_MISSION = 'mission-soc-reunion';

export const PARIS_CLIENT = 'client-banque';
export const REUNION_CLIENT = 'client-reunion';

const address: PostalAddress = {
  line1: '12 rue de la Boétie',
  line2: null,
  postalCode: '75008',
  city: 'Paris',
  country: 'FR',
};

export const parisClient: Client = client({
  id: PARIS_CLIENT,
  name: 'Banque Nord SA',
  siren: '552100554',
  territoriality: 'metropolitanFrance',
  billingAddress: address,
});

export const reunionClient: Client = client({
  id: REUNION_CLIENT,
  name: 'Réunion Santé SAS',
  siren: '380129866',
  territoriality: 'overseasWithVat',
  billingAddress: { ...address, postalCode: '97400', city: 'Saint-Denis' },
});

export const reference: BillingReference = billingReference({
  clients: [parisClient, reunionClient],
  missions: [
    commercialMission({
      id: REGIE_MISSION,
      clientId: PARIS_CLIENT,
      billingModel: 'Regie',
      // Renegotiated on 1 March: the entry that makes a dated rate mean something.
      tjmCents: [
        { from: '2025-01-01', to: '2026-02-28', value: 62_000 },
        { from: '2026-03-01', to: null, value: 65_000 },
      ],
    }),
    commercialMission({
      id: FORFAIT_MISSION,
      clientId: PARIS_CLIENT,
      billingModel: 'Forfait',
      tjmCents: [{ from: '2025-01-01', to: null, value: 70_000 }],
    }),
    commercialMission({
      id: OVERSEAS_MISSION,
      clientId: REUNION_CLIENT,
      billingModel: 'Regie',
      tjmCents: [{ from: '2025-01-01', to: null, value: 58_000 }],
    }),
  ],
});
