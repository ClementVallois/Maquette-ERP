import {
  halfDays,
  type MissionHalfDays,
  TIMESHEET_VALIDATED,
  TIMESHEET_VALIDATED_VERSION,
  type TimesheetValidated,
} from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { ValidatorCannotIssueError } from '../domain/errors.ts';
import {
  FORFAIT_MISSION,
  MENTIONS,
  OVERSEAS_MISSION,
  PARIS_CLIENT,
  REGIE_MISSION,
  REUNION_CLIENT,
  reference,
  SELLER,
  TERMS,
} from '../domain/testing/march-2026.ts';

import { draftInvoicesFrom, onTimesheetValidated } from './draft-invoices.ts';

/**
 * Nothing in this file imports `timesheet`, and nothing could: the dependency rule forbids it, so
 * the event is built from the contract in `@erp/platform` exactly as a real subscriber sees it.
 * That absence is the property ADR-0001 bought, and it is asserted by there being no mock.
 */
function validated(
  missions: readonly MissionHalfDays[],
  validatedBy = 'bruno',
): TimesheetValidated {
  return {
    type: TIMESHEET_VALIDATED,
    version: TIMESHEET_VALIDATED_VERSION,
    occurredAt: new Date('2026-04-03T10:00:00.000Z'),
    correlationId: 'corr-1',
    causationId: null,
    payload: {
      craId: 'cra-1',
      consultantId: 'nadia',
      officeId: 'paris',
      period: '2026-03',
      validatedBy,
      missions,
    },
  };
}

let issued = 0;

const dependencies = {
  reference,
  seller: SELLER,
  terms: TERMS,
  mentions: MENTIONS,
  newInvoiceId: () => `invoice-${String((issued += 1))}`,
  designation: ({ period }: { missionId: string; period: string }) =>
    `Prestation de conseil en régie — ${period}`,
};

describe('drafting from a validated Cra', () => {
  it('bills the régie days of the month at the rate in force then', () => {
    // 42 half-days at 650 €, and the rate is March's — the mission was renegotiated on 1 March,
    // and February's 620 € is what a resolution against "today" would have used.
    const { invoices } = draftInvoicesFrom(
      dependencies,
      validated([{ missionId: REGIE_MISSION, halfDays: halfDays(42) }]),
    );

    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.lines[0]?.origin.tjmCents).toBe(65_000);
    expect(invoices[0]?.totals.totalExcludingVatCents).toBe(1_365_000);
    expect(invoices[0]?.totals.vatTotalCents).toBe(273_000);
  });

  it('resolves the VAT of each client from its own territoriality', () => {
    const { invoices } = draftInvoicesFrom(
      dependencies,
      validated([{ missionId: OVERSEAS_MISSION, halfDays: halfDays(42) }]),
    );

    expect(invoices[0]?.billedTo.clientId).toBe(REUNION_CLIENT);
    expect(invoices[0]?.vatBreakdown[0]?.key).toBe('taxable:850');
  });

  it('produces one invoice per client, because a month can span two of them', () => {
    // The consequence of the payload being a per-mission breakdown. A single invoice here would
    // bill one client for another's days.
    const { invoices } = draftInvoicesFrom(
      dependencies,
      validated([
        { missionId: REGIE_MISSION, halfDays: halfDays(20) },
        { missionId: OVERSEAS_MISSION, halfDays: halfDays(22) },
      ]),
    );

    expect(invoices).toHaveLength(2);
    expect(invoices.map((invoice) => invoice.billedTo.clientId)).toStrictEqual([
      PARIS_CLIENT,
      REUNION_CLIENT,
    ]);
  });

  it('declines the days of a forfait mission, and says so rather than dropping them', () => {
    // ADR-0037. Only régie is invoiced here, and a silent `continue` would leave a reader unable
    // to tell whether the days were considered or lost.
    const { invoices, declined } = draftInvoicesFrom(
      dependencies,
      validated([
        { missionId: REGIE_MISSION, halfDays: halfDays(20) },
        { missionId: FORFAIT_MISSION, halfDays: halfDays(22) },
      ]),
    );

    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.lines).toHaveLength(1);
    expect(declined).toStrictEqual([
      { missionId: FORFAIT_MISSION, halfDays: 22, reason: 'notRegie' },
    ]);
  });

  it('drafts no invoice at all when nothing in the month is billable', () => {
    // The consultant who spent March entirely on a forfait mission. No invoice, and a legible
    // record of why — not an empty document, which the invoice itself refuses anyway.
    const { invoices, declined } = draftInvoicesFrom(
      dependencies,
      validated([{ missionId: FORFAIT_MISSION, halfDays: halfDays(42) }]),
    );

    expect(invoices).toStrictEqual([]);
    expect(declined).toHaveLength(1);
  });

  it('declines a mission the commercial projection does not hold', () => {
    const { invoices, declined } = draftInvoicesFrom(
      dependencies,
      validated([{ missionId: 'mission-unknown', halfDays: halfDays(2) }]),
    );

    expect(invoices).toStrictEqual([]);
    expect(declined[0]?.reason).toBe('unknownMission');
  });

  it('carries the validator onto every invoice it drafts', () => {
    const { invoices } = draftInvoicesFrom(
      dependencies,
      validated([{ missionId: REGIE_MISSION, halfDays: halfDays(2) }], 'bruno'),
    );
    const [invoice] = invoices;

    expect(invoice?.validatedBy).toStrictEqual(['bruno']);
    // And the rule that identity exists for: the manager who accepted the month cannot be the one
    // who issues the demand for payment (ADR-0006, rule 2).
    expect(() => invoice?.issue({ by: 'bruno', sequence: 1, issueDate: '2026-04-03' })).toThrow(
      ValidatorCannotIssueError,
    );
  });

  it('names every line with the record it came from', () => {
    const { invoices } = draftInvoicesFrom(
      dependencies,
      validated([{ missionId: REGIE_MISSION, halfDays: halfDays(2) }]),
    );

    expect(invoices[0]?.lines[0]?.origin).toMatchObject({
      kind: 'RegieDays',
      craId: 'cra-1',
      missionId: REGIE_MISSION,
      period: '2026-03',
    });
  });
});

describe('the subscriber', () => {
  it('reacts to the fact and performs no I/O', async () => {
    // A subscriber runs inside the emitter's transaction (ADR-0001), so it hands its result back
    // rather than writing anything. The day one writes, an outbox is required.
    const seen: number[] = [];
    const handler = onTimesheetValidated(dependencies, (result) => {
      seen.push(result.invoices.length);
    });

    await handler(validated([{ missionId: REGIE_MISSION, halfDays: halfDays(2) }]));

    expect(seen).toStrictEqual([1]);
  });
});
