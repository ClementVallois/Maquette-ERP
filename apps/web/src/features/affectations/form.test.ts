import { describe, expect, it } from 'vitest';

import { assignmentFormRefusal } from './form.ts';
import type { AssignmentInput } from './types.ts';

/**
 * The gate that replaced a native `<select required>` when the consultant and mission pickers
 * became `Button`+`Popover` pairs. `AssignmentScreen` has no render harness in this repository
 * (`apps/web` is tested through Playwright — see `apps/web/e2e/`), so the refusal is extracted as
 * a pure function and covered directly, the same split `pagination-controls.test.ts` uses.
 */
const COMPLETE: AssignmentInput = {
  consultantId: 'consultant-alice',
  missionId: 'mission-soc-run',
  fromDate: '2026-09-01',
  toDate: null,
};

describe('assignmentFormRefusal', () => {
  it('lets a complete form through', () => {
    expect(assignmentFormRefusal(COMPLETE)).toBeNull();
  });

  it('lets an open-ended assignment through — no end date is a valid assignment, not a gap', () => {
    expect(assignmentFormRefusal({ ...COMPLETE, toDate: null })).toBeNull();
  });

  it('refuses the reproduced case: mission and dates filled, no consultant chosen', () => {
    // Before this gate existed, "Affecter" did nothing at all here — no request, no message.
    expect(assignmentFormRefusal({ ...COMPLETE, consultantId: '' })).toBe('consultant');
  });

  it('names the consultant first when nothing at all has been filled in', () => {
    // The field the reader is sent to must be the first one, not the last one that happens to be
    // empty: `AssignmentScreen` focuses the trigger this refusal names.
    expect(
      assignmentFormRefusal({ consultantId: '', missionId: '', fromDate: '', toDate: null }),
    ).toBe('consultant');
  });

  it('refuses a missing mission, now that the browser no longer refuses it first', () => {
    // The mission picker lost its native `<select required>` gate the same way the consultant
    // picker did — reproduces the same silent-no-op bug the `consultant` case above guards.
    expect(assignmentFormRefusal({ ...COMPLETE, missionId: '' })).toBe('mission');
  });

  it('refuses a missing start date, even though the browser normally refuses it first', () => {
    expect(assignmentFormRefusal({ ...COMPLETE, fromDate: '' })).toBe('incomplete');
  });
});
