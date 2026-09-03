import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { API_PROBLEM_TYPES } from '@erp/contracts';
import { BusinessError } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { LABELS } from '../web/labels.ts';

import {
  internalProblem,
  isMappedBusinessError,
  mappedProblemTypes,
  problemFromBusinessError,
  statusForProblemType,
} from './problem.ts';

const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..', '..', '..');
const PACKAGES = join(REPOSITORY_ROOT, 'packages');

/**
 * Every `problemType` literal declared anywhere under `packages/`, read out of the source rather
 * than imported. Importing them would mean constructing 26 error classes with 26 different
 * signatures; reading them means a new error added in a later phase is found by this test on the
 * day it is written, which is the property that matters.
 */
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

class TestRefusal extends BusinessError {
  readonly problemType: string;

  constructor(problemType: string, details: Readonly<Record<string, unknown>> = {}) {
    super(`refused: ${problemType}`, details);
    this.problemType = problemType;
  }
}

const context = { instance: '/api/v1/cras/abc', correlationId: 'corr-1' };

describe('the mapping from problemType to HTTP status', () => {
  const declared = declaredProblemTypes();

  it('reads problem types out of the modules at all', () => {
    // The self-check every guard in this repository owes: if the regex stops matching, every
    // assertion below passes vacuously and reports that the table is complete.
    expect(declared.length).toBeGreaterThan(20);
  });

  it('answers for every problem type the modules declare', () => {
    const unmapped = declared.filter(({ type }) => statusForProblemType(type) === undefined);

    expect(unmapped).toStrictEqual([]);
  });

  it('maps nothing the modules do not declare', () => {
    const declaredTypes = new Set(declared.map(({ type }) => type));
    const orphans = mappedProblemTypes().filter((type) => !declaredTypes.has(type));

    expect(orphans).toStrictEqual([]);
  });

  it('never collides with a problem type the API owns', () => {
    const owned = new Set<string>(Object.values(API_PROBLEM_TYPES));
    const collisions = mappedProblemTypes().filter((type) => owned.has(type));

    expect(collisions).toStrictEqual([]);
  });

  it('answers only 403, 409 or 422 — never 400, never 500', () => {
    const statuses = new Set(mappedProblemTypes().map((type) => statusForProblemType(type)));

    expect([...statuses].sort()).toStrictEqual([403, 409, 422]);
  });
});

describe('problemFromBusinessError', () => {
  it('names the rule that denied a 403, as ADR-0003 requires', () => {
    const problem = problemFromBusinessError(
      new TestRefusal('/problems/not-the-manager', { craId: 'cra-1' }),
      context,
    );

    expect(problem.status).toBe(403);
    expect(problem.deniedBy).toBe('/problems/not-the-manager');
  });

  it('publishes no business fields on a 403', () => {
    // ADR-0016's reconsideration threshold, held as a rule until it earns its own base class: a
    // permission refusal must not describe the record the caller was just told they may not see.
    const problem = problemFromBusinessError(
      new TestRefusal('/problems/validator-cannot-issue', { invoiceNumber: 'SEC-2026-0001' }),
      context,
    );

    expect(problem.errors).toBeUndefined();
    expect(JSON.stringify(problem)).not.toContain('SEC-2026-0001');
  });

  it('names the invariant on a 409, and carries its fields', () => {
    const problem = problemFromBusinessError(
      new TestRefusal('/problems/validated-cra-is-immutable', { status: 'validated' }),
      context,
    );

    expect(problem.status).toBe(409);
    expect(problem.invariant).toBe('/problems/validated-cra-is-immutable');
    expect(problem.errors).toStrictEqual({ status: ['validated'] });
  });

  it('carries the field that was refused on a 422', () => {
    const problem = problemFromBusinessError(
      new TestRefusal('/problems/invalid-value', { field: 'quarterDays', value: 1.5 }),
      context,
    );

    expect(problem.status).toBe(422);
    expect(problem.errors).toStrictEqual({ field: ['quarterDays'], value: ['1.5'] });
  });

  it('degrades an unmapped refusal to a 500 that publishes nothing', () => {
    const problem = problemFromBusinessError(
      new TestRefusal('/problems/invented-yesterday', { secretish: 'do-not-publish' }),
      context,
    );

    expect(problem.status).toBe(500);
    expect(JSON.stringify(problem)).not.toContain('do-not-publish');
    expect(JSON.stringify(problem)).not.toContain('invented-yesterday');
  });

  it('carries the correlation id and the instance on every answer', () => {
    for (const type of ['/problems/not-the-manager', '/problems/cra-incomplete']) {
      const problem = problemFromBusinessError(new TestRefusal(type), context);
      expect(problem.correlationId).toBe('corr-1');
      expect(problem.instance).toBe('/api/v1/cras/abc');
    }
  });
});

describe('internalProblem', () => {
  it('publishes the correlation id and nothing else', () => {
    const problem = internalProblem(context);

    expect(problem.status).toBe(500);
    expect(problem.correlationId).toBe('corr-1');
    expect(problem.errors).toBeUndefined();
    expect(problem.invariant).toBeUndefined();
  });
});

describe('isMappedBusinessError', () => {
  it('accepts a refusal the table answers for', () => {
    expect(isMappedBusinessError(new TestRefusal('/problems/cra-incomplete'))).toBe(true);
  });

  it('refuses a refusal the table does not answer for', () => {
    expect(isMappedBusinessError(new TestRefusal('/problems/invented-yesterday'))).toBe(false);
  });

  it('refuses anything that is not a business error', () => {
    expect(isMappedBusinessError(new RangeError('boom'))).toBe(false);
    expect(isMappedBusinessError('not an error')).toBe(false);
  });
});

describe('the French sentence table of ADR-0060', () => {
  // Widened for lookup, exactly as `problem-page.ts` does it: `LABELS` stays `as const` so every
  // string it holds is readable at the declaration.
  const sentences: Readonly<Record<string, string | undefined>> = LABELS.problem.sentences;

  // `STAFFING_PROBLEM_TYPES` is deliberately absent from this table, and its absence is not the
  // gap it looks like: `sendProblem` picks the representation from the **path**, and every route
  // that can raise one is under `/api/v1/`, which is always `application/problem+json`. A sentence
  // here would be a sentence no page can ever render. `apps/web/src/lib/labels.test.ts` holds the
  // SPA's own table to that family instead — that is where those refusals are read.

  it('names every refusal a module can raise', () => {
    // Same source as the status table above: the literals are read out of `packages/`, so an error
    // added in a later phase is found here on the day it is written rather than rendered as the
    // English `title` on a French page — which is the defect ADR-0060 removes.
    const missing = declaredProblemTypes()
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

  it('names nothing that is not a refusal, so the table cannot rot quietly', () => {
    // The other direction. A sentence for a type nothing raises is a sentence nobody will ever
    // see, and the first sign that the table has drifted from the errors it describes.
    const known = new Set([
      ...declaredProblemTypes().map(({ type }) => type),
      ...Object.values(API_PROBLEM_TYPES),
    ]);
    const orphaned = Object.keys(sentences).filter((type) => !known.has(type));

    expect(orphaned).toStrictEqual([]);
  });
});
