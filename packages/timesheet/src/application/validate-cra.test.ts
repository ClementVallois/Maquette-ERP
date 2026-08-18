import { type DomainEvent, type EventBus, TIMESHEET_VALIDATED } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { SelfValidationForbiddenError } from '../domain/errors.ts';
import {
  calendar,
  CONSULTANT,
  emptyCra,
  fixedClock,
  MANAGER,
  managers,
  MISSION,
  OFFICE,
  submittedCra,
} from '../domain/testing/march-2026.ts';

import { validateCra } from './validate-cra.ts';

function recordingBus(): { bus: EventBus; published: DomainEvent[] } {
  const published: DomainEvent[] = [];

  return {
    published,
    bus: {
      publish: (event) => {
        published.push(event);

        return Promise.resolve();
      },
      subscribe: () => undefined,
    },
  };
}

const clock = fixedClock('2026-04-03T10:00:00.000Z');

describe('validating a Cra', () => {
  it('publishes what the month is worth, per mission', async () => {
    // No mock of `billing` anywhere in this test, and none is possible: this module does not know
    // it exists. That absence is the property ADR-0001 was bought for.
    const { bus, published } = recordingBus();
    const cra = submittedCra();

    const event = await validateCra(
      { clock, events: bus },
      { cra, validatedBy: MANAGER, hierarchy: managers, correlationId: 'req-42' },
    );

    expect(published).toStrictEqual([event]);
    expect(event.type).toBe(TIMESHEET_VALIDATED);
    expect(event.version).toBe(1);
    expect(event.occurredAt).toStrictEqual(new Date('2026-04-03T10:00:00.000Z'));
    expect(event.correlationId).toBe('req-42');
    expect(event.causationId).toBeNull();
    expect(event.payload).toStrictEqual({
      craId: 'cra-1',
      consultantId: CONSULTANT,
      officeId: OFFICE,
      period: '2026-03',
      validatedBy: MANAGER,
      missions: [{ missionId: MISSION, halfDays: 44 }],
    });
  });

  it('breaks the month down when it spans two missions, and leaves absences out', async () => {
    // The reason the payload is a breakdown: one validated Cra, two invoice lines. A single
    // `missionId` would have billed one of the two and lost the other in silence.
    const { bus, published } = recordingBus();
    const cra = emptyCra();
    const workable = calendar.workableDaysOf({ year: 2026, month: 3 });

    for (const [index, day] of workable.entries()) {
      if (index === 0) {
        cra.recordDay({ day, dayType: 'absence', missionId: null, halfDays: 2 });
      } else if (index < 5) {
        cra.recordDay({ day, dayType: 'worked', missionId: 'soc-run', halfDays: 2 });
      } else {
        cra.recordDay({ day, dayType: 'worked', missionId: MISSION, halfDays: 2 });
      }
    }
    cra.submit({
      clock,
      calendar,
      reference: {
        mission: (id) => ({ id, startDate: '2026-01-05', endDate: null }),
        runsOn: () => true,
        isAssigned: () => true,
      },
    });

    await validateCra(
      { clock, events: bus },
      { cra, validatedBy: MANAGER, hierarchy: managers, correlationId: 'req-7' },
    );

    expect(published[0]?.payload).toMatchObject({
      missions: [
        { missionId: MISSION, halfDays: 34 },
        { missionId: 'soc-run', halfDays: 8 },
      ],
    });
  });

  it('carries the event it was caused by, when there is one', async () => {
    const { bus } = recordingBus();

    const event = await validateCra(
      { clock, events: bus },
      {
        cra: submittedCra(),
        validatedBy: MANAGER,
        hierarchy: managers,
        correlationId: 'req-9',
        causationId: 'evt-1',
      },
    );

    expect(event.causationId).toBe('evt-1');
  });

  it('refuses the consultant validating their own month, and publishes nothing', async () => {
    // ADR-0006, first rule. The Cra must also come out unchanged: a refusal that leaves the
    // aggregate validated would be worse than no rule at all.
    const { bus, published } = recordingBus();
    const cra = submittedCra();

    await expect(
      validateCra(
        { clock, events: bus },
        { cra, validatedBy: CONSULTANT, hierarchy: managers, correlationId: 'req-1' },
      ),
    ).rejects.toThrow(SelfValidationForbiddenError);

    expect(published).toStrictEqual([]);
    expect(cra.status).toBe('submitted');
    expect(cra.validatedBy).toBeNull();
  });

  it('publishes nothing when the Cra was never submitted', async () => {
    const { bus, published } = recordingBus();

    await expect(
      validateCra(
        { clock, events: bus },
        { cra: emptyCra(), validatedBy: MANAGER, hierarchy: managers, correlationId: 'req-2' },
      ),
    ).rejects.toThrow();

    expect(published).toStrictEqual([]);
  });
});
