import { type IsoDate, type Period, period } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import type { CraLine } from './cra-line.ts';
import {
  IncompleteCraError,
  MissingHabilitationError,
  MissionNotRunningError,
  NotAssignedError,
  UnknownMissionError,
} from './errors.ts';
import { timesheetReference } from './reference.ts';
import { runSubmissionChecks } from './submission-checks.ts';
import { calendar, CONSULTANT, MARCH, MISSION, reference } from './testing/march-2026.ts';

const MAY = period(2026, 5);

function worked(day: IsoDate, halfDays = 2, missionId = MISSION): CraLine {
  return { day, dayType: 'worked', missionId, halfDays };
}

/** Every workable day of a month, worked on one mission: the shape that passes. */
function fullMonth(target: Period): CraLine[] {
  return calendar.workableDaysOf(target).map((day) => worked(day));
}

function check(lines: readonly CraLine[], target = MARCH) {
  return runSubmissionChecks({
    craId: 'cra-1',
    consultantId: CONSULTANT,
    period: target,
    lines,
    calendar,
    reference,
  });
}

describe('the submission checks', () => {
  it('let a complete month through, with nothing to flag', () => {
    expect(check(fullMonth(MARCH))).toStrictEqual([]);
  });

  it('refuse a day on a mission whose Habilitation the consultant does not hold', () => {
    // The seeded dataset is deliberately **compliant** — Alice holds PASSI, so the demo runs — and
    // a rule that only ever passes is a rule nobody has seen work. This is where it is seen to
    // refuse, and it is the reason ADR-0051 puts the demonstration in a test rather than in the
    // seed: making the seed violate the rule would break `pnpm run seed`.
    const qualified = timesheetReference({
      missions: [
        {
          id: MISSION,
          startDate: '2026-01-05',
          endDate: null,
          requiredHabilitations: ['passi'],
        },
      ],
      assignments: [{ consultantId: CONSULTANT, missionId: MISSION, from: '2026-01-05', to: null }],
      held: [],
    });

    expect(() =>
      runSubmissionChecks({
        craId: 'cra-1',
        consultantId: CONSULTANT,
        period: MARCH,
        lines: fullMonth(MARCH),
        calendar,
        reference: qualified,
      }),
    ).toThrow(MissingHabilitationError);
  });

  it('name the Habilitation that is missing, so the refusal is actionable', () => {
    const qualified = timesheetReference({
      missions: [
        {
          id: MISSION,
          startDate: '2026-01-05',
          endDate: null,
          requiredHabilitations: ['passi', 'secret-defense'],
        },
      ],
      assignments: [{ consultantId: CONSULTANT, missionId: MISSION, from: '2026-01-05', to: null }],
      held: [{ consultantId: CONSULTANT, habilitationId: 'passi', from: '2025-01-01', to: null }],
    });

    expect(() =>
      runSubmissionChecks({
        craId: 'cra-1',
        consultantId: CONSULTANT,
        period: MARCH,
        lines: fullMonth(MARCH),
        calendar,
        reference: qualified,
      }),
    ).toThrow(/secret-defense/u);
  });

  it('let a day through when the consultant holds the Habilitation on that day', () => {
    const qualified = timesheetReference({
      missions: [
        {
          id: MISSION,
          startDate: '2026-01-05',
          endDate: null,
          requiredHabilitations: ['passi'],
        },
      ],
      assignments: [{ consultantId: CONSULTANT, missionId: MISSION, from: '2026-01-05', to: null }],
      held: [{ consultantId: CONSULTANT, habilitationId: 'passi', from: '2025-03-15', to: null }],
    });

    expect(
      runSubmissionChecks({
        craId: 'cra-1',
        consultantId: CONSULTANT,
        period: MARCH,
        lines: fullMonth(MARCH),
        calendar,
        reference: qualified,
      }),
    ).toStrictEqual([]);
  });

  it('judge the Habilitation on the day worked, not on the day submitted', () => {
    // The same dating rule as the `Tjm` and the manager attachment (ADR-0034): a certificate that
    // lapsed on 20/03 covers the days before it and refuses the days after. Without this, a
    // consultant whose qualification expired mid-month either loses the whole month or keeps it.
    const expiring = timesheetReference({
      missions: [
        {
          id: MISSION,
          startDate: '2026-01-05',
          endDate: null,
          requiredHabilitations: ['passi'],
        },
      ],
      assignments: [{ consultantId: CONSULTANT, missionId: MISSION, from: '2026-01-05', to: null }],
      held: [
        { consultantId: CONSULTANT, habilitationId: 'passi', from: '2025-01-01', to: '2026-03-20' },
      ],
    });

    const untilExpiry = calendar
      .workableDaysOf(MARCH)
      .filter((day) => day <= '2026-03-20')
      .map((day) => worked(day));

    expect(expiring.missingHabilitations(CONSULTANT, MISSION, '2026-03-19')).toStrictEqual([]);
    expect(expiring.missingHabilitations(CONSULTANT, MISSION, '2026-03-23')).toStrictEqual([
      'passi',
    ]);
    // The month is incomplete rather than unqualified: the days that remain are all covered.
    expect(() =>
      runSubmissionChecks({
        craId: 'cra-1',
        consultantId: CONSULTANT,
        period: MARCH,
        lines: untilExpiry,
        calendar,
        reference: expiring,
      }),
    ).toThrow(IncompleteCraError);
  });

  it('refuse a day recorded on a mission that does not exist', () => {
    const lines = [...fullMonth(MARCH).slice(1), worked('2026-03-02', 2, 'mission-that-never-was')];

    expect(() => check(lines)).toThrow(UnknownMissionError);
  });

  it('refuse a day recorded on a mission that had already ended', () => {
    // The check the manager would otherwise have to do by hand, on the one line out of twenty-two
    // that falls after the mission's last day.
    const ended = timesheetReference({
      missions: [
        { id: MISSION, startDate: '2026-01-05', endDate: '2026-03-13', requiredHabilitations: [] },
      ],
      assignments: [{ consultantId: CONSULTANT, missionId: MISSION, from: '2026-01-05', to: null }],
    });

    expect(() =>
      runSubmissionChecks({
        craId: 'cra-1',
        consultantId: CONSULTANT,
        period: MARCH,
        lines: fullMonth(MARCH),
        calendar,
        reference: ended,
      }),
    ).toThrow(MissionNotRunningError);
  });

  it('refuse a day recorded before the mission started', () => {
    // The other end of the same rule, and the one an end-date-only check misses: a mission that
    // is still running today did not run in March.
    const startsInApril = timesheetReference({
      missions: [
        { id: MISSION, startDate: '2026-04-01', endDate: null, requiredHabilitations: [] },
      ],
      assignments: [{ consultantId: CONSULTANT, missionId: MISSION, from: '2026-01-05', to: null }],
    });

    expect(() =>
      runSubmissionChecks({
        craId: 'cra-1',
        consultantId: CONSULTANT,
        period: MARCH,
        lines: fullMonth(MARCH),
        calendar,
        reference: startsInApril,
      }),
    ).toThrow(MissionNotRunningError);
  });

  it('refuse a day recorded on a mission the consultant is not staffed on', () => {
    const someoneElses = timesheetReference({
      missions: [
        { id: MISSION, startDate: '2026-01-05', endDate: null, requiredHabilitations: [] },
      ],
      assignments: [
        { consultantId: 'someone-else', missionId: MISSION, from: '2026-01-05', to: null },
      ],
    });

    expect(() =>
      runSubmissionChecks({
        craId: 'cra-1',
        consultantId: CONSULTANT,
        period: MARCH,
        lines: fullMonth(MARCH),
        calendar,
        reference: someoneElses,
      }),
    ).toThrow(NotAssignedError);
  });

  it('refuse a month that does not add up against the working calendar, and name the days', () => {
    const lines = fullMonth(MARCH).filter((line) => line.day !== '2026-03-17');

    try {
      check(lines);
      expect.unreachable('an incomplete month should have been refused');
    } catch (error) {
      expect(error).toBeInstanceOf(IncompleteCraError);
      expect((error as IncompleteCraError).details).toMatchObject({
        missingDays: ['2026-03-17'],
        recordedHalfDays: 42,
        expectedHalfDays: 44,
      });
    }
  });

  it('count a half-worked day as not accounted for', () => {
    // The failure a total-only check misses: 43 of 44 half-days, one day half empty.
    const lines = fullMonth(MARCH).map((line) =>
      line.day === '2026-03-17' ? worked(line.day, 1) : line,
    );

    expect(() => check(lines)).toThrow(IncompleteCraError);
  });

  it('do not count a weekend day towards the month', () => {
    // A Saturday worked does not fill in for a Tuesday missing.
    const lines = [
      ...fullMonth(MARCH).filter((line) => line.day !== '2026-03-17'),
      worked('2026-03-14'),
    ];

    expect(() => check(lines)).toThrow(IncompleteCraError);
  });

  it('flag a weekend that was worked, without refusing it', () => {
    // Weekend work happens in this business. The rule is to surface it for the manager, not to
    // refuse it — a refusal here would make the consultant record it on the Monday instead.
    const flags = check([...fullMonth(MARCH), worked('2026-03-14')]);

    expect(flags).toStrictEqual([{ day: '2026-03-14', reason: 'weekend' }]);
  });

  it('flag a public holiday that was worked', () => {
    const flags = check([...fullMonth(MAY), worked('2026-05-01')], MAY);

    expect(flags).toStrictEqual([{ day: '2026-05-01', reason: 'publicHoliday' }]);
  });

  it('flag a day once, however many lines it carries', () => {
    const flags = check([
      ...fullMonth(MARCH),
      worked('2026-03-14', 1, MISSION),
      worked('2026-03-14', 1, MISSION),
    ]);

    expect(flags).toHaveLength(1);
  });
});
