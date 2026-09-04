import { describe, expect, it } from 'vitest';

import { assignments, consultants, managerAttachments, offices } from '../scripts/lib/seed-data.ts';

/**
 * ADR-0094 — a consultant's manager is in the consultant's own office.
 *
 * The seed is the only writer of `manager_attachments` in this mockup, so the invariant is held
 * where the rows are created and nowhere else: there is no domain rule and no database constraint
 * to fail. That makes it exactly the kind of invariant that decays silently — the defect it
 * replaces was invisible for weeks because the two offending rows happened to name Cras the seed
 * pre-validates. This file is the only thing standing between that and a repeat.
 *
 * What the defect looked like, so the assertions below read as more than bookkeeping:
 * `Cra.validate()` asks the **hierarchy** who may accept a month (`managerOf`, dated, ADR-0034),
 * while every read is bounded by `actor.officeId` (ADR-0042). A cross-office attachment therefore
 * names a manager who alone may validate a `Cra` that no screen will ever show him.
 */

/** A row naming somebody who is not in `consultants` is a broken seed, not a failed invariant —
 * the two are reported differently on purpose, because the fix is not the same. */
class UnknownConsultantError extends Error {}

const byId = new Map(consultants.map((c) => [c.id, c]));

function consultantById(consultantId: string): (typeof consultants)[number] {
  const consultant = byId.get(consultantId);
  if (consultant === undefined) {
    throw new UnknownConsultantError(
      `manager_attachments names an id that is in no consultant row: ${consultantId}`,
    );
  }
  return consultant;
}

function officeOf(consultantId: string): string {
  return consultantById(consultantId).officeId;
}

function roleOf(consultantId: string): string {
  return consultantById(consultantId).role;
}

const crossOffice = managerAttachments.filter(
  (a) => officeOf(a.consultantId) !== officeOf(a.managerId),
);

describe('ADR-0094 — the seed never attaches a consultant to a manager in another office', () => {
  it('gives every consultant a manager in their own office', () => {
    const offenders = crossOffice
      .filter((a) => roleOf(a.consultantId) === 'consultant')
      .map(
        (a) => `${byId.get(a.consultantId)?.email ?? '?'} → ${byId.get(a.managerId)?.email ?? '?'}`,
      );

    expect(offenders).toStrictEqual([]);
  });

  /**
   * The one shape that legitimately crosses an office is a **manager reporting to the director**,
   * who sits in Paris. It is safe only because such a row never produces a `Cra` anybody has to
   * validate: `scripts/seed.ts` writes a `Cra` for a consultant who has an active assignment *and*
   * an active manager attachment, and a manager holds no assignment.
   *
   * That is the whole justification for the exemption, so it is asserted rather than described.
   * The day a manager is given an assignment, this test fails and the exemption has to be
   * re-argued — which is the point: it would resurrect the original defect one level up, with the
   * director in Bruno's old position.
   */
  it('crosses an office only for a manager reporting to the director, who holds no assignment', () => {
    const shapes = crossOffice.map((a) => ({
      consultantRole: roleOf(a.consultantId),
      managerRole: roleOf(a.managerId),
      consultantHasAssignment: assignments.some((x) => x.consultantId === a.consultantId),
    }));

    expect(shapes).not.toStrictEqual([]);
    for (const shape of shapes) {
      expect(shape).toStrictEqual({
        consultantRole: 'manager',
        managerRole: 'director',
        consultantHasAssignment: false,
      });
    }
  });

  /**
   * The reason the fix was not a one-line data edit, kept as an assertion: Rennes had a consultant
   * and no manager, so "attach François to someone in his own office" had nobody to name. An office
   * that gains a consultant and no manager reintroduces the same dead end.
   */
  it('gives every office that has a consultant at least one manager', () => {
    const withoutManager = offices
      .filter((office) =>
        consultants.some((c) => c.officeId === office.id && c.role === 'consultant'),
      )
      .filter(
        (office) => !consultants.some((c) => c.officeId === office.id && c.role === 'manager'),
      )
      .map((office) => office.name);

    expect(withoutManager).toStrictEqual([]);
  });
});
