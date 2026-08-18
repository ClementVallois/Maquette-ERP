import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const ESLINT = 'node_modules/.bin/eslint';

// The fixtures are inside an ignored directory, so linting them needs `--no-ignore`. That is the
// point: they are excluded from the normal run and only this suite looks at them.
const DOMAIN_CLOCK_FIXTURE = 'packages/timesheet/src/domain/__boundary-fixture__/wall-clock.ts';
const TEST_CLOCK_FIXTURE = 'packages/timesheet/src/domain/__boundary-fixture__/wall-clock.test.ts';
const KERNEL_CLOCK_FIXTURE = 'packages/platform/src/__boundary-fixture__/wall-clock.ts';
const DOMAIN_MONEY_FIXTURE = 'packages/billing/src/domain/__boundary-fixture__/float-money.ts';
const TEST_MONEY_FIXTURE = 'packages/billing/src/domain/__boundary-fixture__/float-money.test.ts';
const APPLICATION_MONEY_FIXTURE =
  'packages/billing/src/application/__boundary-fixture__/float-money.ts';
const SHARED_FIXTURE_BUILDER = 'packages/billing/src/domain/testing/march-2026.ts';

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

describe('the money rules', () => {
  it('reject every way a float reaches a monetary value in shipped domain code', () => {
    // The rule `BUILD-RULES.md` claimed in the present tense for two phases while nothing
    // implemented it. Asserted by message rather than by count: four selectors, and a test that
    // only counted would survive three of them being deleted.
    const messages = lint(DOMAIN_MONEY_FIXTURE).map((message) => message.message);

    expect(messages.some((message) => message.includes('No `parseFloat`'))).toBe(true);
    expect(messages.some((message) => message.includes('No `Number()`'))).toBe(true);
    expect(messages.some((message) => message.includes('No `Math.round`'))).toBe(true);
    expect(messages.some((message) => message.includes('No decimal literal'))).toBe(true);
  });

  it('reject the same calls in a test, and allow the float a negative test has to write', () => {
    // The narrowing this pair exists for. `halfDays(1.5)` is a test that proves a factory refuses
    // a float, and it cannot be written without writing one — while a `Math.round` added to make
    // an assertion pass is the failure the rule is about, wherever it is written.
    const messages = lint(TEST_MONEY_FIXTURE).map((message) => message.message);

    expect(messages.some((message) => message.includes('No `parseFloat`'))).toBe(true);
    expect(messages.some((message) => message.includes('No `Number()`'))).toBe(true);
    expect(messages.some((message) => message.includes('No `Math.round`'))).toBe(true);
    expect(messages.some((message) => message.includes('No decimal literal'))).toBe(false);
  });
});

describe('the scopes the money rules apply to', () => {
  it('rejects the calls outside the domain too, where the money also flows', () => {
    // The rule was first written scoped to `domain/` and the kernel, which exempted the one layer
    // that reads a rate off the reference and hands it to a line. `BUILD-RULES.md` § Money states
    // the three calls with no scope, and now so does the config.
    const messages = lint(APPLICATION_MONEY_FIXTURE).map((message) => message.message);

    expect(messages.some((message) => message.includes('No `parseFloat`'))).toBe(true);
    expect(messages.some((message) => message.includes('No `Number()`'))).toBe(true);
    expect(messages.some((message) => message.includes('No `Math.round`'))).toBe(true);
    // And the literal ban stays where ADR-0035 put it: the domain and the kernel.
    expect(messages.some((message) => message.includes('No decimal literal'))).toBe(false);
  });

  it('holds a shared fixture builder to the domain rules, because it is shipped code', () => {
    // `testing/` is not a test: it is in its package's tsconfig, it compiles, and it is where
    // every seeded `tjmCents` of this module is written. It was borrowing the exemption
    // `BUILD-RULES.md` grants to `*.test.ts` on the ground that a test is not shipped.
    const config = JSON.parse(
      execFileSync(ESLINT, ['--print-config', SHARED_FIXTURE_BUILDER], { encoding: 'utf8' }),
    ) as { rules: Record<string, [number, ...{ message: string }[]]> };
    const messages = (config.rules['no-restricted-syntax'] ?? [0]).slice(1) as {
      message: string;
    }[];
    const held = messages.map((entry) => entry.message);

    expect(held.some((message) => message.includes('No decimal literal'))).toBe(true);
    expect(held.some((message) => message.includes('No public setter'))).toBe(true);
    expect(held.some((message) => message.includes('No `Math.round`'))).toBe(true);
    // The one narrowing a fixture builder actually needs: a fake clock is a literal instant.
    expect(held.some((message) => message.includes('No `new Date()` without an argument'))).toBe(
      true,
    );
  });
});
