import { InvalidValueError, period } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { hierarchy } from './hierarchy.ts';

const MOVED_IN_JUNE = hierarchy([
  { consultantId: 'nadia', managerId: 'bruno', from: '2025-01-01', to: '2026-05-31' },
  { consultantId: 'nadia', managerId: 'salima', from: '2026-06-01', to: null },
  { consultantId: 'karim', managerId: 'salima', from: '2025-01-01', to: null },
]);

describe('the dated manager attachment', () => {
  it('gives March its March manager, whatever has happened since', () => {
    // The rule of task 1.8, and the reason the attachment is dated at all: Nadia changed team in
    // June. Her March Cra is Bruno's to accept, even if it is validated in July.
    expect(MOVED_IN_JUNE.managerOf('nadia', period(2026, 3))).toBe('bruno');
    expect(MOVED_IN_JUNE.managerOf('nadia', period(2026, 7))).toBe('salima');
  });

  it('resolves a month at its close, not at its start', () => {
    // A move on the first of the month is the case where the two answers differ. The manager who
    // accepts a month is the one in place when it closed.
    const movedMidMonth = hierarchy([
      { consultantId: 'nadia', managerId: 'bruno', from: '2025-01-01', to: '2026-03-15' },
      { consultantId: 'nadia', managerId: 'salima', from: '2026-03-16', to: null },
    ]);

    expect(movedMidMonth.managerOn('nadia', '2026-03-02')).toBe('bruno');
    expect(movedMidMonth.managerOf('nadia', period(2026, 3))).toBe('salima');
  });

  it('keeps one consultant out of another consultant attachment', () => {
    expect(MOVED_IN_JUNE.managerOn('karim', '2026-03-02')).toBe('salima');
    expect(MOVED_IN_JUNE.managerOn('someone-else', '2026-03-02')).toBeNull();
  });

  it('says nobody rather than guessing when a consultant was attached to no one', () => {
    const gapped = hierarchy([
      { consultantId: 'nadia', managerId: 'bruno', from: '2026-04-01', to: null },
    ]);

    expect(gapped.managerOf('nadia', period(2026, 3))).toBeNull();
  });

  it('refuses two managers for one consultant on the same day', () => {
    // Two managers for two people on one day is normal; two for one person is a data error that
    // would otherwise resolve differently depending on iteration order.
    expect(() =>
      hierarchy([
        { consultantId: 'nadia', managerId: 'bruno', from: '2025-01-01', to: '2026-06-30' },
        { consultantId: 'nadia', managerId: 'salima', from: '2026-06-01', to: null },
      ]),
    ).toThrow(InvalidValueError);
  });
});
