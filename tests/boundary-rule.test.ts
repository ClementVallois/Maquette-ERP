import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const DEPCRUISE = 'node_modules/.bin/depcruise';

const SHIPPED = ['packages/*/src/**/*.ts'];
const FIXTURE = ['packages/billing/src/__boundary-fixture__/**/*.ts'];

interface CruiseResult {
  summary: {
    totalCruised: number;
    violations: { rule: { name: string }; from: string; to: string }[];
  };
}

function cruise(globs: string[], config: string): CruiseResult {
  const args = [...globs, '--config', config, '--output-type', 'json'];
  try {
    return JSON.parse(execFileSync(DEPCRUISE, args, { encoding: 'utf8' })) as CruiseResult;
  } catch (error) {
    // depcruise exits non-zero on violations; the report is still on stdout.
    const { stdout } = error as { stdout?: string };
    if (stdout === undefined) throw error;
    return JSON.parse(stdout) as CruiseResult;
  }
}

describe('the module boundary rule', () => {
  it('rejects an import from billing into timesheet', () => {
    const { summary } = cruise(FIXTURE, '.dependency-cruiser.fixture.cjs');

    expect(summary.violations.map((violation) => violation.rule.name)).toContain(
      'billing-not-to-timesheet',
    );
  });

  it('accepts the code that is actually shipped', () => {
    const { summary } = cruise(SHIPPED, '.dependency-cruiser.cjs');

    // Asserted first and on purpose: a cruise that collects no file reports no violation, so a
    // green run would otherwise prove nothing. This is the failure this suite exists to catch.
    expect(summary.totalCruised).toBeGreaterThan(0);
    expect(summary.violations).toStrictEqual([]);
  });
});
