import type { Persona, PersonaCatalogue } from '../catalogue.ts';

/**
 * The four seeded personas of ADR-0023, without a database. The keys, roles and office pairings
 * are the seed's; the identifiers are not, because the seed's come from a counter and hardcoding
 * them here would make this fixture a second source of truth for them.
 *
 * The integration tests read the real table. This exists so that the access rules — which are
 * about roles and offices and not about rows — are provable at unit speed.
 */

export const PARIS = 'office-paris';
export const LYON = 'office-lyon';

export const FAKE_PERSONAS: readonly Persona[] = [
  {
    key: 'consultant-paris',
    role: 'consultant',
    consultantId: 'alice',
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Alice Martin',
  },
  {
    key: 'manager-paris',
    role: 'manager',
    consultantId: 'bruno',
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Bruno Leroy',
  },
  {
    key: 'manager-lyon',
    role: 'manager',
    consultantId: 'emma',
    officeId: LYON,
    officeName: 'Lyon',
    displayName: 'Emma Robert',
  },
  {
    key: 'billing-paris',
    role: 'billing',
    consultantId: 'henri',
    officeId: PARIS,
    officeName: 'Paris',
    displayName: 'Henri Laurent',
  },
];

export function inMemoryPersonas(personas: readonly Persona[] = FAKE_PERSONAS): PersonaCatalogue {
  return {
    list: () => Promise.resolve(personas),
    byKey: (key) => Promise.resolve(personas.find((persona) => persona.key === key) ?? null),
  };
}
