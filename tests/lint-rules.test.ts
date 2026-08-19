import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

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
const INFRASTRUCTURE_MONEY_FIXTURE =
  'packages/billing/src/infrastructure/__boundary-fixture__/float-money.ts';
const SHARED_FIXTURE_BUILDER = 'packages/billing/src/domain/testing/march-2026.ts';

/** This suite's own setup fault, not a finding about the code under test. */
class FixtureNotLintedError extends Error {
  constructor(file: string) {
    super(`${file} was not linted — is it in FIXTURES?`);
    this.name = 'FixtureNotLintedError';
  }
}

interface LintResult {
  filePath: string;
  messages: { ruleId: string | null; message: string; line: number }[];
}

// Every fixture is linted in ONE ESLint run, memoised on first use. Each invocation is a
// type-aware ESLint over a tsconfig project and costs several seconds to start; one per test put
// the first test over Vitest's default 5 s timeout as soon as a ninth fixture was added.
const FIXTURES = [
  DOMAIN_CLOCK_FIXTURE,
  TEST_CLOCK_FIXTURE,
  KERNEL_CLOCK_FIXTURE,
  DOMAIN_MONEY_FIXTURE,
  TEST_MONEY_FIXTURE,
  APPLICATION_MONEY_FIXTURE,
  INFRASTRUCTURE_MONEY_FIXTURE,
];

let report: Map<string, LintResult['messages']> | null = null;

// Spawned once for the whole file, in a hook with its own budget. A real type-aware ESLint start
// costs several seconds and about twice that under V8 coverage instrumentation; leaving it inside
// the first `it` charged one test for the whole suite's setup and timed out at Vitest's default
// 5 s — a red gate for a reason that has nothing to do with the rules being tested.
beforeAll(() => {
  report = runEslint(FIXTURES);
}, 120_000);

function lint(file: string): LintResult['messages'] {
  const messages = report?.get(resolve(file));
  // A fixture missing from the report is a fixture ESLint did not see — renamed, or absent from
  // FIXTURES. Returning an empty array would make every assertion about it fail as "the rule did
  // not fire", which is the wrong diagnosis for the wrong problem.
  if (messages === undefined) throw new FixtureNotLintedError(file);

  return messages;
}

function runEslint(files: readonly string[]): Map<string, LintResult['messages']> {
  const args = ['--no-ignore', '--format', 'json', ...files];
  let stdout: string;
  try {
    stdout = execFileSync(ESLINT, args, { encoding: 'utf8' });
  } catch (error) {
    // ESLint exits non-zero when it reports an error; the JSON report is still on stdout.
    const failure = error as { stdout?: string };
    if (failure.stdout === undefined) throw error;
    stdout = failure.stdout;
  }

  const results = JSON.parse(stdout) as LintResult[];

  return new Map(results.map((result) => [result.filePath, result.messages]));
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

  it('rejects the calls in infrastructure too, the layer that reads money out of Postgres', () => {
    // `infrastructure/` has its own ESLint block — `@types/pg` is a devDependency, `query<T>` is
    // generic, DB rows carry non-null assertions — and writing it dropped the money calls with
    // the rest. The block's comment claimed the ban was "replaced by the integer-only subset"
    // while nothing held the other half, and `pg-invoice-repository.ts` used bare `Number()` on
    // ten monetary columns. This is that half.
    const messages = lint(INFRASTRUCTURE_MONEY_FIXTURE).map((message) => message.message);

    expect(messages.some((message) => message.includes('No `parseFloat`'))).toBe(true);
    expect(messages.some((message) => message.includes('No `Number()`'))).toBe(true);
    expect(messages.some((message) => message.includes('No `Math.round`'))).toBe(true);
    // The subset the layer genuinely needs stays allowed: the fixture's last line is
    // `Number.parseInt`, and three violations means it was not counted as a fourth.
    expect(messages).toHaveLength(3);
    // The literal ban stays where ADR-0035 put it: the domain and the kernel.
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
