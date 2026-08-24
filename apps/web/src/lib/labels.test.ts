import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { API_PROBLEM_TYPES } from '@erp/contracts';
import { describe, expect, it } from 'vitest';

import { CLIENT_PROBLEM_TYPES } from './api-client.ts';
import { LABELS } from './labels.ts';

/**
 * `LABELS.problem.sentences` must name every refusal this SPA can be shown, from either side of
 * the HTTP boundary — the same property `apps/api/src/http/problem.test.ts` holds the API's own
 * table to, and the same reason: a copy that only ever checks itself against a hand-written list
 * is a tautology that cannot fail, which is the "green gate that stopped looking" family
 * BUILD-RULES names explicitly.
 *
 * `declaredProblemTypes` is ported unchanged from `apps/api/src/http/problem.test.ts` — a
 * `node:fs` scan of `packages/`'s source text, not a module import. It is legitimate from
 * `apps/web`: it never crosses the module graph dependency-cruiser polices (frontend-plan.md §2
 * grants `apps/web` only `@erp/contracts`), because reading a file's bytes at test time is not an
 * `import`. `apps/api`'s own test proves this list is exhaustive against every domain
 * `problemType`; this test proves the SPA's copy of the sentence table has not fallen behind it.
 */
const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const PACKAGES = join(REPOSITORY_ROOT, 'packages');

function declaredProblemTypes(): { type: string; file: string }[] {
  const found: { type: string; file: string }[] = [];

  const walk = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === 'dist') continue;
        walk(path);
        continue;
      }
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;

      for (const match of readFileSync(path, 'utf8').matchAll(/problemType\s*=\s*'([^']+)'/gu)) {
        const type = match[1];
        if (type !== undefined) found.push({ type, file: path.slice(REPOSITORY_ROOT.length + 1) });
      }
    }
  };

  walk(PACKAGES);

  return found;
}

describe('LABELS.problem.sentences', () => {
  const declared = declaredProblemTypes();
  // Widened for lookup by an arbitrary string, matching `lib/problems.ts`'s `sentenceFor`:
  // `LABELS` stays `as const` so every string it holds is readable at the declaration, and an
  // index signature on the table itself would take that away for the sake of these four lookups.
  const sentences: Readonly<Record<string, string | undefined>> = LABELS.problem.sentences;

  it('reads problem types out of the modules at all', () => {
    // The self-check every guard in this repository owes (mirrors `problem.test.ts`): if the
    // regex stops matching, every assertion below passes vacuously and reports the table complete.
    expect(declared.length).toBeGreaterThan(20);
  });

  it('names every domain refusal a module can raise', () => {
    const missing = declared
      .filter(({ type }) => sentences[type] === undefined)
      .map(({ type, file }) => `${type} (${file})`);

    expect(missing).toStrictEqual([]);
  });

  it('names every refusal the API itself can raise', () => {
    const missing = Object.values(API_PROBLEM_TYPES).filter(
      (type) => sentences[type] === undefined,
    );

    expect(missing).toStrictEqual([]);
  });

  it('names the two client-originated sentinels of lib/api-client.ts', () => {
    const missing = Object.values(CLIENT_PROBLEM_TYPES).filter(
      (type) => sentences[type] === undefined,
    );

    expect(missing).toStrictEqual([]);
  });

  it('names nothing that is not a refusal, so the table cannot rot quietly', () => {
    const known = new Set<string>([
      ...declared.map(({ type }) => type),
      ...Object.values(API_PROBLEM_TYPES),
      ...Object.values(CLIENT_PROBLEM_TYPES),
    ]);
    const orphaned = Object.keys(LABELS.problem.sentences).filter((type) => !known.has(type));

    expect(orphaned).toStrictEqual([]);
  });
});
