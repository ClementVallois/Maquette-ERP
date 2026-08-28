import type { ProblemDetails } from '@erp/contracts';
import { describe, expect, it } from 'vitest';

import { missingDaysFrom } from './missing-days.ts';

function problem(overrides: Partial<ProblemDetails>): ProblemDetails {
  return {
    type: '/problems/cra-incomplete',
    title: 'IncompleteCraError',
    status: 409,
    detail: 'the month does not add up',
    ...overrides,
  };
}

describe('missingDaysFrom', () => {
  it('reads the days out of the JSON text the API double-encodes them as', () => {
    const days = missingDaysFrom(
      problem({ errors: { missingDays: ['["2026-08-04","2026-08-06"]'] } }),
    );

    expect([...days]).toStrictEqual(['2026-08-04', '2026-08-06']);
  });

  it('is empty for a refusal that is not cra-incomplete, even one carrying the field', () => {
    const days = missingDaysFrom(
      problem({ type: '/problems/day-overbooked', errors: { missingDays: ['["2026-08-04"]'] } }),
    );

    expect(days.size).toBe(0);
  });

  it('is empty for no refusal at all', () => {
    expect(missingDaysFrom(null).size).toBe(0);
  });

  it('is empty rather than throwing when the field is absent, unparseable or not a list', () => {
    expect(missingDaysFrom(problem({})).size).toBe(0);
    expect(missingDaysFrom(problem({ errors: { missingDays: ['not json'] } })).size).toBe(0);
    expect(missingDaysFrom(problem({ errors: { missingDays: ['{"a":1}'] } })).size).toBe(0);
  });

  it('keeps only the strings, so a malformed entry cannot flag a day nothing named', () => {
    const days = missingDaysFrom(problem({ errors: { missingDays: ['["2026-08-04",7,null]'] } }));

    expect([...days]).toStrictEqual(['2026-08-04']);
  });
});
