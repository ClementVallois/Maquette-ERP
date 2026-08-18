import { type Clock, period } from '@erp/platform';

import { Cra } from '../cra.ts';
import { type TimesheetReference, timesheetReference } from '../reference.ts';
import { type WorkingCalendar, workingCalendar } from '../working-calendar.ts';

/**
 * The month every test of this module works in, built once so that a test says what it is about
 * rather than filling twenty-two days of March.
 *
 * March 2026 is chosen because it carries no public holiday: the calendar contributes weekends
 * only, so a test that fails is failing on the rule it is testing.
 */
export const MARCH = period(2026, 3);

export const CONSULTANT = 'nadia';
export const MANAGER = 'bruno';
export const MISSION = 'audit-passi';
export const OFFICE = 'paris';

export function fixedClock(iso = '2026-04-02T09:00:00.000Z'): Clock {
  const instant = new Date(iso);

  return { now: () => instant };
}

export const calendar: WorkingCalendar = workingCalendar();

export const reference: TimesheetReference = timesheetReference({
  missions: [{ id: MISSION, startDate: '2026-01-05', endDate: null }],
  assignments: [{ consultantId: CONSULTANT, missionId: MISSION, from: '2026-01-05', to: null }],
});

export function emptyCra(id = 'cra-1'): Cra {
  return Cra.open({ id, consultantId: CONSULTANT, officeId: OFFICE, period: MARCH });
}

/** Every workable day of March worked on one mission: the shape a complete Cra has. */
export function completeCra(id = 'cra-1'): Cra {
  const cra = emptyCra(id);

  for (const day of calendar.workableDaysOf(MARCH)) {
    cra.recordDay({ day, dayType: 'worked', missionId: MISSION, halfDays: 2 });
  }

  return cra;
}

export function submittedCra(id = 'cra-1'): Cra {
  const cra = completeCra(id);
  cra.submit({ clock: fixedClock(), calendar, reference });

  return cra;
}

export function validatedCra(id = 'cra-1'): Cra {
  const cra = submittedCra(id);
  cra.validate({ by: MANAGER, clock: fixedClock('2026-04-03T10:00:00.000Z') });

  return cra;
}
