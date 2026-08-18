import { afterAll, describe, expect, it } from 'vitest';

import { closePool, getPool } from './db.ts';
import { type PersistableEvent, PgEventStore } from './pg-event-store.ts';
import { useTestTransaction } from './rollback.ts';

// ---------------------------------------------------------------------------
// Simple persistence tests — the per-test rollback harness is enough.
// ---------------------------------------------------------------------------

describe('PgEventStore', () => {
  const tx = useTestTransaction();

  function makeEvent(overrides?: Partial<PersistableEvent>): PersistableEvent {
    return {
      type: 'timesheet.TimesheetValidated',
      version: 1,
      occurredAt: new Date('2026-06-15T10:30:00Z'),
      correlationId: 'corr-001',
      causationId: null,
      payload: {
        craId: 'cra-001',
        consultantId: 'consultant-1',
        officeId: 'office-paris',
        period: '2026-06',
        validatedBy: 'manager-1',
        missions: [{ missionId: 'mission-1', halfDays: 42 }],
      },
      ...overrides,
    };
  }

  it('persists an event with correct fields', async () => {
    const store = new PgEventStore(tx.client);
    const event = makeEvent();

    const id = await store.persist(event);
    expect(id).toBeTruthy();

    const { rows } = await tx.client.query<EventRow>(
      `SELECT * FROM public.domain_events WHERE id = $1`,
      [id],
    );

    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.type).toBe('timesheet.TimesheetValidated');
    expect(row.version).toBe(1);
    expect(new Date(row.occurred_at).toISOString()).toBe('2026-06-15T10:30:00.000Z');
    expect(row.correlation_id).toBe('corr-001');
    expect(row.causation_id).toBeNull();
    expect(row.payload).toStrictEqual({
      craId: 'cra-001',
      consultantId: 'consultant-1',
      officeId: 'office-paris',
      period: '2026-06',
      validatedBy: 'manager-1',
      missions: [{ missionId: 'mission-1', halfDays: 42 }],
    });
  });

  it('persists causationId when present', async () => {
    const store = new PgEventStore(tx.client);
    const event = makeEvent({ causationId: 'cause-001' });

    const id = await store.persist(event);
    const { rows } = await tx.client.query<EventRow>(
      `SELECT causation_id FROM public.domain_events WHERE id = $1`,
      [id],
    );

    expect(rows[0]!.causation_id).toBe('cause-001');
  });

  it('events are queryable by correlationId', async () => {
    const store = new PgEventStore(tx.client);

    await store.persist(makeEvent({ correlationId: 'chain-A' }));
    await store.persist(
      makeEvent({
        type: 'billing.InvoiceDrafted',
        correlationId: 'chain-A',
        causationId: 'cause-from-validation',
      }),
    );
    await store.persist(makeEvent({ correlationId: 'chain-B' }));

    const { rows } = await tx.client.query<{ type: string }>(
      `SELECT type FROM public.domain_events WHERE correlation_id = $1 ORDER BY type`,
      ['chain-A'],
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.type)).toStrictEqual([
      'billing.InvoiceDrafted',
      'timesheet.TimesheetValidated',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Transactional guarantee — the event rolls back with the state change.
// ---------------------------------------------------------------------------

describe('PgEventStore — transactional guarantees', () => {
  afterAll(async () => {
    await closePool();
  });

  it('a rolled-back event is not persisted', async () => {
    const pool = getPool();
    const writer = await pool.connect();
    const reader = await pool.connect();

    try {
      await writer.query('BEGIN');

      const store = new PgEventStore(writer);
      const id = await store.persist({
        type: 'timesheet.TimesheetValidated',
        version: 1,
        occurredAt: new Date('2026-06-15T10:30:00Z'),
        correlationId: 'corr-rollback-test',
        causationId: null,
        payload: { craId: 'cra-rollback' },
      });

      await writer.query('ROLLBACK');

      const { rows } = await reader.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM public.domain_events WHERE id = $1`,
        [id],
      );
      expect(Number.parseInt(rows[0]!.count, 10)).toBe(0);
    } finally {
      writer.release();
      reader.release();
    }
  });
});

interface EventRow {
  id: string;
  type: string;
  version: number;
  occurred_at: Date;
  correlation_id: string;
  causation_id: string | null;
  payload: Record<string, unknown>;
}
