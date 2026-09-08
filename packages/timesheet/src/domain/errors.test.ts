import { describe, expect, it } from 'vitest';

import { CraAlreadyExistsError } from './errors.ts';

describe('CraAlreadyExistsError', () => {
  it('names the consultant and the period, because that pair is the unique key it races against', () => {
    // Thrown only from `PgCraRepository#save` as the second boundary of ADR-0103's creation
    // guard (the advisory lock in `findByConsultantAndPeriodForWrite` is the first) — exercised
    // end to end in `pg-cra-repository.int.test.ts`. This test covers the constructor's own
    // contract in isolation, the same way `CraAlreadyProcessedError` is covered in
    // `packages/billing/src/domain/invoice.test.ts`.
    const error = new CraAlreadyExistsError('consultant-1', '2026-07');

    expect(error.message).toContain('consultant-1');
    expect(error.message).toContain('2026-07');
    expect(error.problemType).toBe('/problems/cra-already-exists');
    expect(error.details).toStrictEqual({ consultantId: 'consultant-1', period: '2026-07' });
  });
});
