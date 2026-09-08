import { describe, expect, it } from 'vitest';

import { assignmentPolicy } from './assignment-policy.ts';

describe('assignmentPolicy', () => {
  const mission = {
    startDate: '2026-01-01' as const,
    endDate: null,
    requiredHabilitations: ['passi'],
  };

  it('accepts a covered interval without a departure or mission boundary conflict', () => {
    expect(
      assignmentPolicy({
        from: '2026-07-01',
        to: '2026-07-31',
        departureDate: null,
        mission,
        heldHabilitations: [{ id: 'passi', from: '2026-01-01', to: null }],
      }),
    ).toBeNull();
  });

  it('returns domain facts for each interval refusal', () => {
    expect(
      assignmentPolicy({
        from: '2026-07-31',
        to: '2026-07-01',
        departureDate: null,
        mission,
        heldHabilitations: [],
      }),
    ).toStrictEqual({ kind: 'invalidRange', from: '2026-07-31', to: '2026-07-01' });

    expect(
      assignmentPolicy({
        from: '2026-07-01',
        to: null,
        departureDate: '2026-08-01',
        mission,
        heldHabilitations: [],
      }),
    ).toStrictEqual({ kind: 'departure', departureDate: '2026-08-01' });

    expect(
      assignmentPolicy({
        from: '2025-12-31',
        to: '2026-07-31',
        departureDate: null,
        mission,
        heldHabilitations: [],
      }),
    ).toStrictEqual({
      kind: 'missionDates',
      missionStartDate: '2026-01-01',
      missionEndDate: null,
    });
  });

  it('merges contiguous habilitation periods and names only uncovered requirements', () => {
    expect(
      assignmentPolicy({
        from: '2026-07-01',
        to: '2026-07-31',
        departureDate: null,
        mission: { ...mission, requiredHabilitations: ['passi', 'secret'] },
        heldHabilitations: [
          { id: 'passi', from: '2026-07-01', to: '2026-07-15' },
          { id: 'passi', from: '2026-07-16', to: '2026-07-31' },
        ],
      }),
    ).toStrictEqual({ kind: 'missingHabilitations', ids: ['secret'] });
  });
});
