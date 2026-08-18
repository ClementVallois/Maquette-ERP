import { type Clock, InvalidValueError, period } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { Cra } from './cra.ts';
import {
  CraTransitionError,
  DayOutsidePeriodError,
  DayOverbookedError,
  MissionOnNonWorkedDayError,
  MissionRequiredError,
  RefusalReasonRequiredError,
  ValidatedCraIsImmutableError,
} from './errors.ts';

const MARCH = period(2026, 3);
const CONSULTANT = 'consultant-1';
const MANAGER = 'manager-1';
const MISSION = 'mission-1';

/** Fixed on purpose: a dated invariant tested against the wall clock is a flaky test. */
function fixedClock(iso = '2026-04-02T09:00:00.000Z'): Clock {
  const instant = new Date(iso);

  return { now: () => instant };
}

function draft(): Cra {
  return Cra.open({ id: 'cra-1', consultantId: CONSULTANT, officeId: 'paris', period: MARCH });
}

function submitted(): Cra {
  const cra = draft();
  cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, halfDays: 2 });
  cra.submit(fixedClock());

  return cra;
}

function validated(): Cra {
  const cra = submitted();
  cra.validate({ by: MANAGER, clock: fixedClock() });

  return cra;
}

describe('a Cra', () => {
  it('opens as a draft with no line', () => {
    const cra = draft();

    expect(cra.status).toBe('draft');
    expect(cra.lines).toStrictEqual([]);
    expect(cra.submittedAt).toBeNull();
  });

  it('records a day on a mission', () => {
    const cra = draft();

    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, halfDays: 2 });

    expect(cra.lines).toStrictEqual([
      { day: '2026-03-02', dayType: 'worked', missionId: MISSION, halfDays: 2 },
    ]);
  });

  it('splits a day between two missions', () => {
    const cra = draft();

    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-a', halfDays: 1 });
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-b', halfDays: 1 });

    expect(cra.halfDaysOn('2026-03-02')).toBe(2);
  });

  it('hands out its lines as a copy', () => {
    // An aggregate whose caller can push into its own array holds no invariant at all.
    const cra = draft();
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, halfDays: 2 });

    (cra.lines as { length: number }).length = 0;

    expect(cra.lines).toHaveLength(1);
  });

  it('refuses more than two half-days on one day', () => {
    const cra = draft();
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-a', halfDays: 2 });

    expect(() => {
      cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-b', halfDays: 1 });
    }).toThrow(DayOverbookedError);
  });

  it('refuses a day outside the month it records', () => {
    const cra = draft();

    expect(() => {
      cra.recordDay({ day: '2026-04-01', dayType: 'worked', missionId: MISSION, halfDays: 2 });
    }).toThrow(DayOutsidePeriodError);
  });

  it('refuses a worked day with no mission, and an absence with one', () => {
    const cra = draft();

    expect(() => {
      cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: null, halfDays: 2 });
    }).toThrow(MissionRequiredError);
    expect(() => {
      cra.recordDay({ day: '2026-03-03', dayType: 'absence', missionId: MISSION, halfDays: 2 });
    }).toThrow(MissionOnNonWorkedDayError);
  });

  it('refuses a quantity that is not one or two half-days', () => {
    const cra = draft();

    expect(() => {
      cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, halfDays: 3 });
    }).toThrow(InvalidValueError);
    expect(() => {
      cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, halfDays: 0.5 });
    }).toThrow(InvalidValueError);
  });

  it('clears a day so a correction is remove-then-record', () => {
    const cra = draft();
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
    const cra = draft();
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, halfDays: 2 });

    cra.submit(fixedClock());
    expect(cra.status).toBe('submitted');
    expect(cra.submittedAt).toStrictEqual(new Date('2026-04-02T09:00:00.000Z'));

    cra.validate({ by: MANAGER, clock: fixedClock('2026-04-03T10:00:00.000Z') });
    expect(cra.status).toBe('validated');
    expect(cra.validatedBy).toBe(MANAGER);
    expect(cra.validatedAt).toStrictEqual(new Date('2026-04-03T10:00:00.000Z'));
  });

  it('sends a refused Cra back to the consultant, with the reason', () => {
    const cra = submitted();

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
    const cra = submitted();
    cra.refuse({ by: MANAGER, reason: 'wrong mission', clock: fixedClock() });

    cra.recordDay({ day: '2026-03-03', dayType: 'worked', missionId: MISSION, halfDays: 2 });
    cra.submit(fixedClock());

    expect(cra.status).toBe('submitted');
    expect(cra.refusal).toBeNull();
  });

  it('refuses a refusal that says nothing', () => {
    const cra = submitted();

    expect(() => {
      cra.refuse({ by: MANAGER, reason: '   ', clock: fixedClock() });
    }).toThrow(RefusalReasonRequiredError);
  });

  it('refuses to edit a submitted Cra', () => {
    const cra = submitted();

    expect(() => {
      cra.recordDay({ day: '2026-03-03', dayType: 'worked', missionId: MISSION, halfDays: 2 });
    }).toThrow(CraTransitionError);
    expect(() => {
      cra.clearDay('2026-03-02');
    }).toThrow(CraTransitionError);
    expect(() => {
      cra.submit(fixedClock());
    }).toThrow(CraTransitionError);
  });

  it('refuses to validate a Cra that was never submitted', () => {
    const cra = draft();

    expect(() => {
      cra.validate({ by: MANAGER, clock: fixedClock() });
    }).toThrow(CraTransitionError);
  });

  it('refuses to refuse a Cra that is not submitted', () => {
    const cra = draft();

    expect(() => {
      cra.refuse({ by: MANAGER, reason: 'no', clock: fixedClock() });
    }).toThrow(CraTransitionError);
  });
});

describe('a validated Cra', () => {
  it('does not change, whatever is asked of it', () => {
    // ADR-0005. Four attempts, one error type, and the message names the legal reason: a Cra is
    // a record of working time, and this one has already produced an invoice.
    const cra = validated();

    for (const attempt of [
      () => {
        cra.recordDay({ day: '2026-03-04', dayType: 'worked', missionId: MISSION, halfDays: 2 });
      },
      () => {
        cra.clearDay('2026-03-02');
      },
      () => {
        cra.submit(fixedClock());
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
    expect(cra.lines).toHaveLength(1);
  });

  it('names the Cra and what was attempted on it', () => {
    const cra = validated();

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
