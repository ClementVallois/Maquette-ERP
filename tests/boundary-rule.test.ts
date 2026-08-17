import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const DEPCRUISE = 'node_modules/.bin/depcruise';

const SHIPPED = ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'];
const DECLARED_ARROW_FIXTURE = ['packages/billing/src/__boundary-fixture__/**/*.ts'];
const UNDECLARED_MODULE_FIXTURE = ['packages/__boundary-fixture__/**/*.ts'];
const APP_FIXTURE = ['apps/__boundary-fixture__/src/**/*.ts'];
const MODULE_TO_APP_FIXTURE = ['packages/timesheet/src/__boundary-fixture__/**/*.ts'];

const APP_ALLOWED = 'apps/__boundary-fixture__/src/allowed-public-import.ts';
const APP_DEEP = 'apps/__boundary-fixture__/src/forbidden-deep-import.ts';

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
    const { summary } = cruise(DECLARED_ARROW_FIXTURE, '.dependency-cruiser.fixture.cjs');

    expect(summary.violations.map((violation) => violation.rule.name)).toContain(
      'billing-not-to-timesheet',
    );
  });

  it('rejects a module that was never granted a dependency', () => {
    // The named rules only forbid the arrows someone thought of. This asserts the default is
    // deny, which is what ADR-0001 claims and what a `forbidden`-only config does not do.
    const { summary } = cruise(UNDECLARED_MODULE_FIXTURE, '.dependency-cruiser.fixture.cjs');

    expect(summary.violations.map((violation) => violation.rule.name)).toContain('not-in-allowed');
  });

  it('lets an app import a module through its public entry point', () => {
    // The only positive case in this suite, and it earns its place: the two rules below both pass
    // if `apps/` is forbidden everything, which would be a boundary that seals the wrong thing.
    const { summary } = cruise(APP_FIXTURE, '.dependency-cruiser.fixture.cjs');

    expect(summary.totalCruised).toBeGreaterThan(0);
    expect(summary.violations.filter((violation) => violation.from === APP_ALLOWED)).toStrictEqual(
      [],
    );
  });

  it('rejects an app reaching past a module entry point', () => {
    const { summary } = cruise(APP_FIXTURE, '.dependency-cruiser.fixture.cjs');

    const rules = summary.violations
      .filter((violation) => violation.from === APP_DEEP)
      .map((violation) => violation.rule.name);

    expect(rules).toContain('not-in-allowed');
  });

  it('rejects a module importing an app', () => {
    const { summary } = cruise(MODULE_TO_APP_FIXTURE, '.dependency-cruiser.fixture.cjs');

    // By name, not by count: the same import also trips the whitelist, and a test that only
    // asserted "something was reported" would survive the deletion of the named rule.
    expect(summary.violations.map((violation) => violation.rule.name)).toContain(
      'no-module-to-app',
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
