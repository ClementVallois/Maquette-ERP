import { InvalidValueError } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { Cra } from './cra.ts';
import {
  CraAfterDepartureError,
  CraTransitionError,
  DayOutsidePeriodError,
  DayOverbookedError,
  MissionOnNonWorkedDayError,
  InconsistentPersistedCraError,
  MissionRequiredError,
  NotTheManagerError,
  RefusalReasonRequiredError,
  SelfValidationForbiddenError,
  ValidatedCraIsImmutableError,
} from './errors.ts';
import { hierarchy } from './hierarchy.ts';
import {
  calendar,
  CONSULTANT,
  completeCra,
  emptyCra,
  fixedClock,
  MANAGER,
  managers,
  MARCH,
  MISSION,
  OFFICE,
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

  it('keeps what it was opened with', () => {
    const cra = emptyCra('cra-77');

    expect(cra.id).toBe('cra-77');
    expect(cra.consultantId).toBe(CONSULTANT);
    expect(cra.officeId).toBe(OFFICE);
    expect(cra.period).toStrictEqual({ year: 2026, month: 3 });
  });

  it('records a day on a mission', () => {
    const cra = emptyCra();

    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, quarterDays: 4 });

    expect(cra.lines).toStrictEqual([
      { day: '2026-03-02', dayType: 'worked', missionId: MISSION, quarterDays: 4 },
    ]);
  });

  it('splits a day between two missions', () => {
    const cra = emptyCra();

    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-a', quarterDays: 2 });
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-b', quarterDays: 2 });

    expect(cra.quarterDaysOn('2026-03-02')).toBe(4);
  });

  it('carries four quarter-days of one day as four lines', () => {
    // The bound on a day is a sum over its lines, not a count of them: four separate quarters
    // fill a day exactly, and none of the four is the one that overflows it (ADR-0069). A `2 + 2`
    // split passes even where the rule is written as "at most two lines", which is what this case
    // is here to tell apart.
    const cra = emptyCra();

    for (const mission of ['mission-a', 'mission-b', 'mission-c', 'mission-d']) {
      cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: mission, quarterDays: 1 });
    }

    expect(cra.lines).toHaveLength(4);
    expect(cra.quarterDaysOn('2026-03-02')).toBe(4);
  });

  it('hands out its lines as a copy', () => {
    // An aggregate whose caller can push into its own array holds no invariant at all.
    const cra = emptyCra();
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, quarterDays: 4 });

    (cra.lines as { length: number }).length = 0;

    expect(cra.lines).toHaveLength(1);
  });

  it('refuses more than four quarter-days on one day', () => {
    const cra = emptyCra();
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-a', quarterDays: 4 });

    expect(() => {
      cra.recordDay({
        day: '2026-03-02',
        dayType: 'worked',
        missionId: 'mission-b',
        quarterDays: 1,
      });
    }).toThrow(DayOverbookedError);
  });

  it('refuses a day outside the month it records', () => {
    const cra = emptyCra();

    expect(() => {
      cra.recordDay({ day: '2026-04-01', dayType: 'worked', missionId: MISSION, quarterDays: 4 });
    }).toThrow(DayOutsidePeriodError);
  });

  it('refuses a worked day with no mission, and an absence with one', () => {
    const cra = emptyCra();

    expect(() => {
      cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: null, quarterDays: 4 });
    }).toThrow(MissionRequiredError);
    expect(() => {
      cra.recordDay({
        day: '2026-03-03',
        dayType: 'absence',
        missionId: MISSION,
        quarterDays: 4,
      });
    }).toThrow(MissionOnNonWorkedDayError);
  });

  it('refuses a quantity that is not one to four quarter-days', () => {
    const cra = emptyCra();

    expect(() => {
      cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: MISSION, quarterDays: 5 });
    }).toThrow(InvalidValueError);
    expect(() => {
      cra.recordDay({
        day: '2026-03-02',
        dayType: 'worked',
        missionId: MISSION,
        quarterDays: 0.5,
      });
    }).toThrow(InvalidValueError);
  });

  it('clears a day so a correction is remove-then-record', () => {
    const cra = emptyCra();
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-a', quarterDays: 2 });
    cra.recordDay({ day: '2026-03-02', dayType: 'worked', missionId: 'mission-b', quarterDays: 2 });
    cra.recordDay({ day: '2026-03-03', dayType: 'absence', missionId: null, quarterDays: 4 });

    cra.clearDay('2026-03-02');

    expect(cra.quarterDaysOn('2026-03-02')).toBe(0);
    expect(cra.lines).toHaveLength(1);
  });
});

describe('Cra.open and a consultant departure (ADR-0079)', () => {
  it('opens normally for a consultant still with the firm (departure null)', () => {
    expect(() => emptyCra('cra-1', null)).not.toThrow();
  });

  it('opens normally for a period that ends before the departure', () => {
    // MARCH is 2026-03; a departure the following month does not touch it.
    expect(() => emptyCra('cra-1', '2026-04-01')).not.toThrow();
  });

  it('opens normally the day the departure IS the first day of the period', () => {
    // "Starts after" is strict: a consultant who left on 1 March still had a March to record.
    expect(() => emptyCra('cra-1', '2026-03-01')).not.toThrow();
  });

  it('refuses a period that starts after the departure', () => {
    // Left mid-February; March starts after that.
    expect(() => emptyCra('cra-1', '2026-02-15')).toThrow(CraAfterDepartureError);
  });

  it('names the period and the departure it conflicts with', () => {
    try {
      emptyCra('cra-1', '2026-02-15');
      expect.unreachable('the guard should have refused the period');
    } catch (error) {
      expect((error as CraAfterDepartureError).details).toStrictEqual({
        period: '2026-03',
        departure: '2026-02-15',
      });
    }
  });
});

describe('the Cra lifecycle', () => {
  it('goes draft, submitted, validated', () => {
    const cra = completeCra();

    cra.submit({ clock: fixedClock(), calendar, reference });
    expect(cra.status).toBe('submitted');
    expect(cra.submittedAt).toStrictEqual(new Date('2026-04-02T09:00:00.000Z'));

    cra.validate({
      by: MANAGER,
      clock: fixedClock('2026-04-03T10:00:00.000Z'),
      hierarchy: managers,
    });
    expect(cra.status).toBe('validated');
    expect(cra.validatedBy).toBe(MANAGER);
    expect(cra.validatedAt).toStrictEqual(new Date('2026-04-03T10:00:00.000Z'));
  });

  it('carries the days the calendar flagged to the manager', () => {
    // The flags are a deliverable of the manager's screen, not a by-product: a Saturday that was
    // worked has to be visible to the person accepting the month.
    const cra = completeCra();
    cra.recordDay({ day: '2026-03-14', dayType: 'worked', missionId: MISSION, quarterDays: 4 });

    cra.submit({ clock: fixedClock(), calendar, reference });

    expect(cra.flags).toStrictEqual([{ day: '2026-03-14', reason: 'weekend' }]);
  });

  it('sends a refused Cra back to the consultant, with the reason', () => {
    const cra = submittedCra();

    cra.refuse({
      by: MANAGER,
      reason: 'the 12th is a mission that ended in February',
      clock: fixedClock(),
      hierarchy: managers,
    });

    expect(cra.status).toBe('refused');
    expect(cra.refusal?.reason).toBe('the 12th is a mission that ended in February');
    expect(cra.refusal?.by).toBe(MANAGER);
  });

  it('lets a refused Cra be corrected and resubmitted, and drops the stale refusal', () => {
    const cra = submittedCra();
    cra.refuse({
      by: MANAGER,
      reason: 'the 3rd was leave, not a worked day',
      clock: fixedClock(),
      hierarchy: managers,
    });

    cra.clearDay('2026-03-03');
    cra.recordDay({ day: '2026-03-03', dayType: 'absence', missionId: null, quarterDays: 4 });
    cra.submit({ clock: fixedClock(), calendar, reference });

    expect(cra.status).toBe('submitted');
    expect(cra.refusal).toBeNull();
  });

  it('refuses a refusal that says nothing', () => {
    const cra = submittedCra();

    expect(() => {
      cra.refuse({ by: MANAGER, reason: '   ', clock: fixedClock(), hierarchy: managers });
    }).toThrow(RefusalReasonRequiredError);
  });

  it('refuses to edit a submitted Cra', () => {
    const cra = submittedCra();

    expect(() => {
      cra.recordDay({ day: '2026-03-03', dayType: 'worked', missionId: MISSION, quarterDays: 4 });
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
      cra.validate({ by: MANAGER, clock: fixedClock(), hierarchy: managers });
    }).toThrow(CraTransitionError);
  });

  it('refuses a refusal from a manager who is not this consultant’s manager', () => {
    // The symmetry with `validate`: who may act on a Cra has one answer per record (ADR-0006),
    // not one per verb. Until 21/08/2026 any manager of the office could send back a month they
    // do not manage, because only `validate` consulted the dated attachment (ADR-0034).
    const cra = submittedCra();

    expect(() => {
      cra.refuse({
        by: 'another-manager',
        reason: 'not mine to judge',
        clock: fixedClock(),
        hierarchy: managers,
      });
    }).toThrow(NotTheManagerError);
  });

  it('refuses a consultant refusing their own month', () => {
    const cra = submittedCra();

    expect(() => {
      cra.refuse({
        by: CONSULTANT,
        reason: 'I changed my mind',
        clock: fixedClock(),
        hierarchy: managers,
      });
    }).toThrow(SelfValidationForbiddenError);
  });

  it('refuses to refuse a Cra that is not submitted', () => {
    const cra = emptyCra();

    expect(() => {
      cra.refuse({ by: MANAGER, reason: 'no', clock: fixedClock(), hierarchy: managers });
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
        cra.recordDay({ day: '2026-03-07', dayType: 'worked', missionId: MISSION, quarterDays: 4 });
      },
      () => {
        cra.clearDay('2026-03-02');
      },
      () => {
        cra.submit({ clock: fixedClock(), calendar, reference });
      },
      () => {
        cra.refuse({
          by: MANAGER,
          reason: 'changed my mind',
          clock: fixedClock(),
          hierarchy: managers,
        });
      },
      () => {
        cra.validate({ by: MANAGER, clock: fixedClock(), hierarchy: managers });
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

describe('who may validate', () => {
  it('refuses a manager who was not the manager of that month', () => {
    // Nadia moved to Salima's team in June. Salima validating March is refused, and the error
    // names who the manager actually was.
    const cra = submittedCra();
    const movedInJune = hierarchy([
      { consultantId: CONSULTANT, managerId: MANAGER, from: '2025-01-01', to: '2026-05-31' },
      { consultantId: CONSULTANT, managerId: 'salima', from: '2026-06-01', to: null },
    ]);

    try {
      cra.validate({ by: 'salima', clock: fixedClock(), hierarchy: movedInJune });
      expect.unreachable('a manager of another month should have been refused');
    } catch (error) {
      expect(error).toBeInstanceOf(NotTheManagerError);
      expect((error as NotTheManagerError).details).toMatchObject({
        period: '2026-03',
        attempted: 'salima',
        manager: MANAGER,
      });
    }

    expect(cra.status).toBe('submitted');
  });

  it('refuses anyone at all when the consultant was attached to nobody', () => {
    const cra = submittedCra();

    expect(() =>
      cra.validate({ by: MANAGER, clock: fixedClock(), hierarchy: hierarchy([]) }),
    ).toThrow(NotTheManagerError);
  });
});

describe('Cra.reconstitute', () => {
  // The one door into the aggregate that sets a status without running the transition that sets
  // the fields alongside it: the repository's own door into the aggregate.
  const AN_INSTANT = new Date('2026-04-03T10:00:00.000Z');

  function persistedCra(overrides: Partial<Parameters<typeof Cra.reconstitute>[0]> = {}): Cra {
    return Cra.reconstitute({
      id: 'cra-1',
      consultantId: CONSULTANT,
      officeId: OFFICE,
      period: MARCH,
      status: 'draft',
      lines: [],
      flags: [],
      submittedAt: null,
      validatedBy: null,
      validatedAt: null,
      refusal: null,
      ...overrides,
    });
  }

  it('rebuilds a validated Cra with everything the transition set', () => {
    const cra = persistedCra({
      status: 'validated',
      validatedBy: MANAGER,
      validatedAt: AN_INSTANT,
    });

    expect(cra.status).toBe('validated');
    expect(cra.validatedBy).toBe(MANAGER);
  });

  it('refuses a validated Cra that nobody validated', () => {
    // The state `validate` cannot produce, and the state a row can hold. Without the guard the
    // aggregate exists in it, which is what "no object in an invalid state" is supposed to rule
    // out — for every caller including the database.
    expect(() => persistedCra({ status: 'validated', validatedAt: AN_INSTANT })).toThrow(
      InconsistentPersistedCraError,
    );
  });

  it('refuses a validated Cra with no validation date', () => {
    expect(() => persistedCra({ status: 'validated', validatedBy: MANAGER })).toThrow(
      InconsistentPersistedCraError,
    );
  });

  it('refuses a refused Cra with no refusal', () => {
    expect(() => persistedCra({ status: 'refused' })).toThrow(InconsistentPersistedCraError);
  });

  it('refuses a submitted Cra with no submission date', () => {
    expect(() => persistedCra({ status: 'submitted' })).toThrow(InconsistentPersistedCraError);
  });

  it('refuses a draft that already carries a submission date', () => {
    // The same fault from the other side: a status that is behind the fields, not ahead of them.
    expect(() => persistedCra({ submittedAt: AN_INSTANT })).toThrow(InconsistentPersistedCraError);
  });

  it('refuses a Cra that is not validated yet carries a validation', () => {
    expect(() =>
      persistedCra({ status: 'submitted', submittedAt: AN_INSTANT, validatedBy: MANAGER }),
    ).toThrow(InconsistentPersistedCraError);
  });

  it('is not retryable: the row will read the same way next time', () => {
    try {
      persistedCra({ status: 'refused' });
      expect.unreachable();
    } catch (error) {
      expect((error as InconsistentPersistedCraError).retryable).toBe(false);
    }
  });
});

describe('Cra — timestamp immutability (ADR-0108)', () => {
  // No type cast anywhere in this block: `Date` has a mutating method (`setUTCFullYear`) that
  // reaches through `readonly` without one. `CraLine`'s own plain-primitive-field hole — a cast
  // defeats `readonly` too, just by reassigning the field directly rather than calling a method —
  // is a separate gap, tested in its own block below.

  it('does not change a validated Cra when the caller mutates the Date it read back', () => {
    const cra = validatedCra();
    const originalTime = cra.validatedAt!.getTime();

    cra.validatedAt!.setUTCFullYear(2030);

    expect(cra.validatedAt!.getTime()).toBe(originalTime);
    expect(cra.validatedAt!.getUTCFullYear()).not.toBe(2030);
  });

  it('does not change a submitted Cra when the caller mutates the Date it read back', () => {
    const cra = submittedCra();
    const originalTime = cra.submittedAt!.getTime();

    cra.submittedAt!.setUTCFullYear(2030);

    expect(cra.submittedAt!.getTime()).toBe(originalTime);
  });

  it('does not change a refused Cra when the caller mutates the refusal Date it read back', () => {
    const cra = submittedCra();
    cra.refuse({ by: MANAGER, reason: 'incomplet', clock: fixedClock(), hierarchy: managers });
    const originalTime = cra.refusal!.at.getTime();

    cra.refusal!.at.setUTCFullYear(2030);

    expect(cra.refusal!.at.getTime()).toBe(originalTime);
  });

  it('returns a fresh Date object on every read, not the same reference twice', () => {
    // A weaker but simpler proof than the three above: even a caller who never mutates anything
    // cannot come to hold the aggregate's own internal reference.
    const cra = validatedCra();

    expect(cra.validatedAt).not.toBe(cra.validatedAt);
  });

  it('is not affected by mutating the clock-sourced Date after the transition that used it', () => {
    // The write-side counterpart of the three tests above: `Clock.now()` promises nothing about
    // returning a fresh instance every call, and this codebase's own `fixedClock` test double
    // returns the identical `Date` reference from every `now()` call in its lifetime — so the
    // clock, not just the getter, is a real aliasing vector unless the transition copies too.
    const instant = new Date('2026-04-02T09:00:00.000Z');
    const clock = { now: () => instant };
    const cra = completeCra();
    cra.submit({ clock, calendar, reference });
    const submittedAtBefore = cra.submittedAt!.getTime();

    instant.setUTCFullYear(2030);

    expect(cra.submittedAt!.getTime()).toBe(submittedAtBefore);
  });

  it('does not change a reconstituted Cra when the caller mutates the Date object it passed in', () => {
    // The input-side counterpart: `Cra.reconstitute` is the door a repository comes through, and
    // the row-mapping layer builds a `Date` it hands over — this proves the aggregate does not
    // keep that exact reference either.
    const submittedAt = new Date('2026-04-02T09:00:00.000Z');
    const validatedAt = new Date('2026-04-03T10:00:00.000Z');
    const refusalAt = new Date('2026-04-03T10:00:00.000Z');

    const cra = Cra.reconstitute({
      id: 'cra-1',
      consultantId: CONSULTANT,
      officeId: OFFICE,
      period: MARCH,
      status: 'validated',
      lines: [],
      flags: [],
      submittedAt,
      validatedBy: MANAGER,
      validatedAt,
      refusal: null,
    });
    const validatedAtBefore = cra.validatedAt!.getTime();
    const submittedAtBefore = cra.submittedAt!.getTime();

    submittedAt.setUTCFullYear(2030);
    validatedAt.setUTCFullYear(2030);
    refusalAt.setUTCFullYear(2030);

    expect(cra.submittedAt!.getTime()).toBe(submittedAtBefore);
    expect(cra.validatedAt!.getTime()).toBe(validatedAtBefore);
  });

  it('does not change a reconstituted refused Cra when the caller mutates the refusal object it passed in', () => {
    const refusalAt = new Date('2026-04-03T10:00:00.000Z');
    const refusal = { by: MANAGER, at: refusalAt, reason: 'incomplet' };

    const cra = Cra.reconstitute({
      id: 'cra-1',
      consultantId: CONSULTANT,
      officeId: OFFICE,
      period: MARCH,
      status: 'refused',
      lines: [],
      flags: [],
      submittedAt: new Date('2026-04-02T09:00:00.000Z'),
      validatedBy: null,
      validatedAt: null,
      refusal,
    });
    const refusalAtBefore = cra.refusal!.at.getTime();

    refusalAt.setUTCFullYear(2030);

    expect(cra.refusal!.at.getTime()).toBe(refusalAtBefore);
  });
});

describe('Cra — line immutability (ADR-0108)', () => {
  // `CraLine` holds only strings and a number — no mutating method, unlike `Date` — but a cast
  // still defeats `readonly` by reassigning a field directly. Copying an array does not copy its
  // objects: a shallow array copy stops a caller pushing or splicing, but not reaching an element
  // already inside it.

  it('does not change a Cra when the caller mutates a line it read back', () => {
    const cra = completeCra();
    const stolen = cra.lines[0] as { quarterDays: number };
    stolen.quarterDays = 1;

    expect(cra.lines[0]!.quarterDays).not.toBe(1);
  });

  it('returns a fresh line object on every read, not the same reference twice', () => {
    const cra = completeCra();

    expect(cra.lines[0]).not.toBe(cra.lines[0]);
  });

  it('does not change a reconstituted Cra when the caller mutates a line object it passed in', () => {
    const line = {
      day: '2026-03-02',
      dayType: 'worked' as const,
      missionId: MISSION,
      quarterDays: 4 as const,
    };

    const cra = Cra.reconstitute({
      id: 'cra-1',
      consultantId: CONSULTANT,
      officeId: OFFICE,
      period: MARCH,
      status: 'draft',
      lines: [line],
      flags: [],
      submittedAt: null,
      validatedBy: null,
      validatedAt: null,
      refusal: null,
    });

    (line as { quarterDays: number }).quarterDays = 1;

    expect(cra.lines[0]!.quarterDays).toBe(4);
  });
});
