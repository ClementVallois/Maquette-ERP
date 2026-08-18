import { describe, expect, it } from 'vitest';

import { timesheetReference } from './reference.ts';

const reference = timesheetReference({
  missions: [
    { id: 'audit-passi', startDate: '2026-01-05', endDate: '2026-03-13' },
    { id: 'soc-run', startDate: '2026-02-01', endDate: null },
  ],
  assignments: [
    { consultantId: 'nadia', missionId: 'audit-passi', from: '2026-01-05', to: '2026-03-13' },
    { consultantId: 'nadia', missionId: 'soc-run', from: '2026-03-16', to: null },
  ],
});

describe('the reference a Cra is checked against', () => {
  it('finds a mission, and says nothing about one it does not hold', () => {
    expect(reference.mission('soc-run')?.startDate).toBe('2026-02-01');
    expect(reference.mission('unknown')).toBeNull();
  });

  it('includes both ends of a mission', () => {
    // A mission that ends on the 13th was worked on the 13th. An exclusive bound here silently
    // refuses the last day of every mission in the firm.
    expect(reference.runsOn('audit-passi', '2026-01-05')).toBe(true);
    expect(reference.runsOn('audit-passi', '2026-03-13')).toBe(true);
    expect(reference.runsOn('audit-passi', '2026-03-16')).toBe(false);
    expect(reference.runsOn('audit-passi', '2026-01-02')).toBe(false);
  });

  it('treats an open end as still running', () => {
    expect(reference.runsOn('soc-run', '2026-12-31')).toBe(true);
  });

  it('answers nothing for a mission it does not hold', () => {
    expect(reference.runsOn('unknown', '2026-03-02')).toBe(false);
  });

  it('reads an assignment by date, not by mission alone', () => {
    // Nadia moves from the audit to the SOC mid-March. The same consultant and the same two
    // missions give opposite answers on the 12th and on the 17th.
    expect(reference.isAssigned('nadia', 'audit-passi', '2026-03-12')).toBe(true);
    expect(reference.isAssigned('nadia', 'soc-run', '2026-03-12')).toBe(false);
    expect(reference.isAssigned('nadia', 'audit-passi', '2026-03-17')).toBe(false);
    expect(reference.isAssigned('nadia', 'soc-run', '2026-03-17')).toBe(true);
  });

  it('does not lend one consultant another consultant assignment', () => {
    expect(reference.isAssigned('bruno', 'soc-run', '2026-03-17')).toBe(false);
  });
});
