import { InvalidValueError } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import {
  CraTransitionError,
  DayOutsidePeriodError,
  DayOverbookedError,
  MissionOnNonWorkedDayError,
  MissionRequiredError,
  RefusalReasonRequiredError,
  ValidatedCraIsImmutableError,
} from './errors.ts';
import {
  calendar,
  completeCra,
  emptyCra,
  fixedClock,
  MANAGER,
  MISSION,
  reference,
  submittedCra,
  validatedCra,
} from './testing/march-2026.ts';

describe('a Cra', () => {
  it('opens as a draft with no line', () => {
    const cra = emptyCra();

    expect(cra.status).toBe('draft');
    expect(cra.lines).toStrictEqual([]);
    expect(cra.submittedAt).toBeNull();
  });

  it('records a day on a mission', () => {
    const cra = emptyCra();

    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, halfDays: 2 });

    expect(cra.lines).toStrictEqual([
      { day: '2026-03-02', dayType: 'worked', missionId: MISSION, halfDays: 2 },
    ]);
  });

  it('splits a day between two missions', () => {
    const cra = emptyCra();

    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-a', halfDays: 1 });
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-b', halfDays: 1 });

    expect(cra.halfDaysOn('2026-03-02')).toBe(2);
  });

  it('hands out its lines as a copy', () => {
    // An aggregate whose caller can push into its own array holds no invariant at all.
    const cra = emptyCra();
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, halfDays: 2 });

    (cra.lines as { length: number }).length = 0;

    expect(cra.lines).toHaveLength(1);
  });

  it('refuses more than two half-days on one day', () => {
    const cra = emptyCra();
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-a', halfDays: 2 });

    expect(() => {
      cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-b', halfDays: 1 });
    }).toThrow(DayOverbookedError);
  });

  it('refuses a day outside the month it records', () => {
    const cra = emptyCra();

    expect(() => {
      cra.recordDay({ day: '2026-04-01', dayType: 'worked', missionId: MISSION, halfDays: 2 });
    }).toThrow(DayOutsidePeriodError);
  });

  it('refuses a worked day with no mission, and an absence with one', () => {
    const cra = emptyCra();

    expect(() => {
      cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: null, halfDays: 2 });
    }).toThrow(MissionRequiredError);
    expect(() => {
      cra.recordDay({ day: '2026-03-03', dayType: 'absence', missionId: MISSION, halfDays: 2 });
    }).toThrow(MissionOnNonWorkedDayError);
  });

  it('refuses a quantity that is not one or two half-days', () => {
    const cra = emptyCra();

    expect(() => {
      cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, halfDays: 3 });
    }).toThrow(InvalidValueError);
    expect(() => {
      cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, halfDays: 0.5 });
    }).toThrow(InvalidValueError);
  });

  it('clears a day so a correction is remove-then-record', () => {
    const cra = emptyCra();
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-a', halfDays: 1 });
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-b', halfDays: 1 });
    cra.recordDay({ day: '2026-03-03', dayType: 'absence', missionId: null, halfDays: 2 });

    cra.clearDay('2026-03-02');

    expect(cra.halfDaysOn('2026-03-02')).toBe(0);
    expect(cra.lines).toHaveLength(1);
  });
});

describe('the Cra lifecycle', () => {
  it('goes draft, submitted, validated', () => {
    const cra = completeCra();

    cra.submit({ clock: fixedClock(), calendar, reference });
    expect(cra.status).toBe('submitted');
    expect(cra.submittedAt).toStrictEqual(new Date('2026-04-02T09:00:00.000Z'));

    cra.validate({ by: MANAGER, clock: fixedClock('2026-04-03T10:00:00.000Z') });
    expect(cra.status).toBe('validated');
    expect(cra.validatedBy).toBe(MANAGER);
    expect(cra.validatedAt).toStrictEqual(new Date('2026-04-03T10:00:00.000Z'));
  });

  it('sends a refused Cra back to the consultant, with the reason', () => {
    const cra = submittedCra();

    cra.refuse({
      by: MANAGER,
      reason: 'the 12th is a mission that ended in February',
      clock: fixedClock(),
    });

    expect(cra.status).toBe('refused');
    expect(cra.refusal?.reason).toBe('the 12th is a mission that ended in February');
    expect(cra.refusal?.by).toBe(MANAGER);
  });

  it('lets a refused Cra be corrected and resubmitted, and drops the stale refusal', () => {
    const cra = submittedCra();
    cra.refuse({ by: MANAGER, reason: 'the 3rd was leave, not a worked day', clock: fixedClock() });

    cra.clearDay('2026-03-03');
    cra.recordDay({ day: '2026-03-03', dayType: 'absence', missionId: null, halfDays: 2 });
    cra.submit({ clock: fixedClock(), calendar, reference });

    expect(cra.status).toBe('submitted');
    expect(cra.refusal).toBeNull();
  });

  it('refuses a refusal that says nothing', () => {
    const cra = submittedCra();

    expect(() => {
      cra.refuse({ by: MANAGER, reason: '   ', clock: fixedClock() });
    }).toThrow(RefusalReasonRequiredError);
  });

  it('refuses to edit a submitted Cra', () => {
    const cra = submittedCra();

    expect(() => {
      cra.recordDay({ day: '2026-03-03', dayType: 'worked', missionId: MISSION, halfDays: 2 });
    }).toThrow(CraTransitionError);
    expect(() => {
      cra.clearDay('2026-03-02');
    }).toThrow(CraTransitionError);
    expect(() => {
      cra.submit({ clock: fixedClock(), calendar, reference });
    }).toThrow(CraTransitionError);
  });

  it('refuses to validate a Cra that was never submitted', () => {
    const cra = emptyCra();

    expect(() => {
      cra.validate({ by: MANAGER, clock: fixedClock() });
    }).toThrow(CraTransitionError);
  });

  it('refuses to refuse a Cra that is not submitted', () => {
    const cra = emptyCra();

    expect(() => {
      cra.refuse({ by: MANAGER, reason: 'no', clock: fixedClock() });
    }).toThrow(CraTransitionError);
  });
});

describe('a validated Cra', () => {
  it('does not change, whatever is asked of it', () => {
    // ADR-0005. Four attempts, one error type, and the message names the legal reason: a Cra is
    // a record of working time, and this one has already produced an invoice.
    const cra = validatedCra();

    for (const attempt of [
      () => {
        cra.recordDay({ day: '2026-03-07', dayType: 'worked', missionId: MISSION, halfDays: 2 });
      },
      () => {
        cra.clearDay('2026-03-02');
      },
      () => {
        cra.submit({ clock: fixedClock(), calendar, reference });
      },
      () => {
        cra.refuse({ by: MANAGER, reason: 'changed my mind', clock: fixedClock() });
      },
      () => {
        cra.validate({ by: MANAGER, clock: fixedClock() });
      },
    ]) {
      expect(attempt).toThrow(ValidatedCraIsImmutableError);
    }

    expect(cra.status).toBe('validated');
    expect(cra.lines).toHaveLength(22);
  });

  it('names the Cra and what was attempted on it', () => {
    const cra = validatedCra();

    try {
      cra.clearDay('2026-03-02');
      expect.unreachable('a validated Cra should have refused');
    } catch (error) {
      expect((error as ValidatedCraIsImmutableError).details).toStrictEqual({
        craId: 'cra-1',
        attempted: 'clear a day',
      });
      expect((error as ValidatedCraIsImmutableError).message).toContain('record of working time');
    }
  });
});
