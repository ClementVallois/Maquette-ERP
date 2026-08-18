import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const ESLINT = 'node_modules/.bin/eslint';

// The fixtures are inside an ignored directory, so linting them needs `--no-ignore`. That is the
// point: they are excluded from the normal run and only this suite looks at them.
const DOMAIN_CLOCK_FIXTURE = 'packages/timesheet/src/domain/__boundary-fixture__/wall-clock.ts';
const TEST_CLOCK_FIXTURE = 'packages/timesheet/src/domain/__boundary-fixture__/wall-clock.test.ts';
const KERNEL_CLOCK_FIXTURE = 'packages/platform/src/__boundary-fixture__/wall-clock.ts';

interface LintResult {
  filePath: string;
  messages: { ruleId: string | null; message: string; line: number }[];
}

function lint(file: string): LintResult['messages'] {
  const args = ['--no-ignore', '--format', 'json', file];
  let stdout: string;
  try {
    stdout = execFileSync(ESLINT, args, { encoding: 'utf8' });
  } catch (error) {
    // ESLint exits non-zero when it reports an error; the JSON report is still on stdout.
    const failure = error as { stdout?: string };
    if (failure.stdout === undefined) throw error;
    stdout = failure.stdout;
  }

  const [result] = JSON.parse(stdout) as LintResult[];

  return result?.messages ?? [];
}

describe('the clock rules', () => {
  it('reject building a Date in shipped domain code, literal argument or not', () => {
    const messages = lint(DOMAIN_CLOCK_FIXTURE);

    expect(messages.map((message) => message.ruleId)).toStrictEqual(['no-restricted-syntax']);
    expect(messages[0]?.message).toContain('injected `Clock`');
  });

  it('reject the wall clock in a test, and allow a fixed instant', () => {
    // The narrowing this suite exists for. A fake clock is built from a literal instant, so the
    // absolute ban cannot apply here — but a test that reads the wall clock passes today and
    // fails on 29 February, which is the failure the rule is actually about.
    const messages = lint(TEST_CLOCK_FIXTURE);

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.ruleId)).toStrictEqual([
      'no-restricted-syntax',
      'no-restricted-syntax',
    ]);
    expect(messages.map((message) => message.line)).toStrictEqual([3, 4]);
  });

  it('hold the shared kernel to the same rules as a module domain', () => {
    // ADR-0033 moved domain-grade code into `@erp/platform`. This asserts the ESLint block that
    // holds `domain/` follows it there: no wall clock, and no public setter.
    const rules = lint(KERNEL_CLOCK_FIXTURE).map((message) => message.message);

    expect(rules.some((message) => message.includes('injected `Clock`'))).toBe(true);
    expect(rules.some((message) => message.includes('No public setter'))).toBe(true);
  });
});
