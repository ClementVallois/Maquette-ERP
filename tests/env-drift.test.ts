import { describe, expect, it } from 'vitest';

import { composeReferences, envProblems } from '../scripts/env-drift.ts';

const EXAMPLE = 'POSTGRES_USER=erp_migration\nPOSTGRES_PORT=5433\n';
const COMPOSE = [
  'services:',
  '  postgres:',
  '    environment:',
  '      POSTGRES_USER: ${POSTGRES_USER:?set POSTGRES_USER in .env}',
  '    ports:',
  "      - '${POSTGRES_PORT:?set POSTGRES_PORT in .env}:5432'",
  '    healthcheck:',
  // Both escaped forms compose accepts. `$${BRACED}` is the one that matters: strip the `$$` and
  // it becomes `{BRACED}`, which matches nothing; leave it and `${BRACED}` matches, inventing a
  // host variable out of a string the container expands.
  '      test: [\'CMD-SHELL\', \'pg_isready -U "$$POSTGRES_USER" -d "$${BRACED}"\']',
].join('\n');
const LOCAL = EXAMPLE;

const agreeing = { example: EXAMPLE, compose: COMPOSE, local: LOCAL };

describe('the environment drift guard', () => {
  it('reports nothing when the three sources agree', () => {
    expect(envProblems(agreeing)).toStrictEqual([]);
  });

  it('rejects a compose variable the template does not declare', () => {
    const compose = `${COMPOSE}\n      NEW_THING: \${NEW_THING:?set it}`;

    expect(envProblems({ ...agreeing, compose })).toStrictEqual([
      'compose.yml needs NEW_THING, and .env.example does not declare it.',
    ]);
  });

  it('rejects a template key the local .env has not caught up with', () => {
    const example = `${EXAMPLE}ADDED_LATER=1\n`;

    expect(envProblems({ ...agreeing, example })).toStrictEqual([
      '.env is missing ADDED_LATER, added to .env.example since it was copied.',
    ]);
  });

  it('rejects a local key the template does not document', () => {
    const local = `${LOCAL}NEXT_PUBLIC_API_URL=http://localhost:3000\n`;

    expect(envProblems({ ...agreeing, local })).toStrictEqual([
      '.env sets NEXT_PUBLIC_API_URL, which .env.example does not document.',
    ]);
  });

  it('treats a missing .env as a failure, not as nothing to check', () => {
    const problems = envProblems({ ...agreeing, local: undefined });

    expect(problems).toStrictEqual(['No .env. Run `pnpm run env:init`.']);
  });

  // The three cases above all pass vacuously if the parse stops matching, which is how a guard
  // dies quietly. These two assert the guard notices it has gone blind.
  it('fails when it reads no variable out of compose.yml', () => {
    const problems = envProblems({
      ...agreeing,
      compose: 'services:\n  postgres:\n    image: x\n',
    });

    expect(problems[0]).toContain('Read no `${VAR}` at all out of compose.yml');
  });

  it('fails when it reads no variable out of the template', () => {
    const problems = envProblems({ ...agreeing, example: '# only a comment\n' });

    expect(problems[0]).toContain('Read no variable at all out of .env.example');
  });

  // The defect these three close: `env:check` was green on a .env whose POSTGRES_PORT had been
  // changed to dodge a port collision while MIGRATION_DATABASE_URL still carried the old one, so
  // `pnpm run setup` migrated and seeded a *different* database than the one it had just started.
  // Seeding truncates three schemas, so the cost of the gap was someone else's data.
  it('rejects a database URL whose port disagrees with POSTGRES_PORT', () => {
    const local =
      'POSTGRES_USER=erp_migration\nPOSTGRES_PORT=5434\n' +
      'DATABASE_URL=postgres://erp_app:pw@localhost:5433/erp\n';
    const example = `${EXAMPLE}DATABASE_URL=postgres://erp_app:pw@localhost:5433/erp\n`;

    const problems = envProblems({ ...agreeing, example, local });

    expect(problems.join('\n')).toContain('DATABASE_URL');
    expect(problems.join('\n')).toContain('5434');
  });

  it('names every disagreeing URL, not just the first', () => {
    const urls =
      'DATABASE_URL=postgres://erp_app:pw@localhost:5433/erp\n' +
      'MIGRATION_DATABASE_URL=postgres://erp_migration:pw@localhost:5433/erp\n';
    const local = `POSTGRES_USER=erp_migration\nPOSTGRES_PORT=5434\n${urls}`;

    const problems = envProblems({ ...agreeing, example: `${EXAMPLE}${urls}`, local });

    expect(problems.join('\n')).toContain('MIGRATION_DATABASE_URL');
    expect(problems.filter((p) => p.includes('5434'))).toHaveLength(2);
  });

  it('accepts URLs that carry the configured port', () => {
    const urls =
      'DATABASE_URL=postgres://erp_app:pw@localhost:5434/erp\n' +
      'MIGRATION_DATABASE_URL=postgres://erp_migration:pw@localhost:5434/erp\n';
    const local = `POSTGRES_USER=erp_migration\nPOSTGRES_PORT=5434\n${urls}`;

    expect(envProblems({ ...agreeing, example: `${EXAMPLE}${urls}`, local })).toStrictEqual([]);
  });

  it('ignores `$$VAR`, which compose expands inside the container', () => {
    // The healthcheck line in the fixture. Read as a host variable, it would demand a
    // POSTGRES_USER declaration for the wrong reason and pass for the wrong reason too.
    expect([...composeReferences(COMPOSE)]).toStrictEqual(['POSTGRES_USER', 'POSTGRES_PORT']);
  });
});
