import { API_PROBLEM_TYPES, type ProblemDetails } from '@erp/contracts';
import { describe, expect, it } from 'vitest';

import { classifyProblem, headingFor, sentenceFor } from './problems.ts';

/**
 * `labels.test.ts` proves `LABELS.problem.sentences` is exhaustive — every `type` has an entry.
 * It does not prove the two functions that read that table, or `classifyProblem`, behave right on
 * the cases that actually matter: the ADR-0060 fallback, and the ordering `classifyProblem` uses
 * to tell `unknown-persona` apart from an ordinary `denied` refusal that also carries `deniedBy`.
 * Both are exactly the shape BUILD-RULES asks every guard for — "a negative test — a test that
 * proves the rule rejects" — reordering either `if` silently breaks a real screen path (Phase 4's
 * cookie purge) with nothing here to catch it otherwise.
 */

const CONTEXT = { instance: '/api/v1/scratch', correlationId: 'corr-1' } as const;

describe('sentenceFor', () => {
  it('falls back to the heading for its status, never to the English title, for an unknown type', () => {
    // The exact defect ADR-0060 removes: an unmapped refusal must not surface the API's own
    // English `title` on a French page.
    const problem: ProblemDetails = {
      type: '/problems/invented-tomorrow',
      title: 'This is English and must never render',
      status: 403,
      ...CONTEXT,
    };

    expect(sentenceFor(problem)).toBe(headingFor(problem));
    expect(sentenceFor(problem)).not.toBe(problem.title);
  });

  it('renders the mapped French sentence for a known type', () => {
    const problem: ProblemDetails = {
      type: API_PROBLEM_TYPES.notFound,
      title: 'No such Cra',
      status: 404,
      ...CONTEXT,
    };

    expect(sentenceFor(problem)).toBe('Cette page ou cet enregistrement n’existe pas.');
  });
});

describe('classifyProblem', () => {
  it('classifies unknown-persona by type, even though the response also carries deniedBy', () => {
    // `personas/access.ts` sends exactly this shape for a tampered or expired cookie: `type`
    // AND `deniedBy` both set to `API_PROBLEM_TYPES.unknownPersona`. A generic "has deniedBy"
    // check reached before the type check would misclassify this as an ordinary `denied` refusal
    // and skip the cookie purge + redirect `unknown-persona` needs — the exact reorder this test
    // exists to catch.
    const problem: ProblemDetails = {
      type: API_PROBLEM_TYPES.unknownPersona,
      title: 'Unknown persona',
      status: 403,
      deniedBy: API_PROBLEM_TYPES.unknownPersona,
      ...CONTEXT,
    };

    expect(classifyProblem(problem)).toStrictEqual({ kind: 'unknown-persona' });
  });

  it('redirects to the selector on no-persona', () => {
    const problem: ProblemDetails = {
      type: API_PROBLEM_TYPES.noPersona,
      title: 'No persona selected',
      status: 401,
      ...CONTEXT,
    };

    expect(classifyProblem(problem)).toStrictEqual({ kind: 'redirect-to-selector' });
  });

  it('classifies an ordinary 403 as denied, naming deniedBy', () => {
    const problem: ProblemDetails = {
      type: '/problems/out-of-scope',
      title: 'Out of scope',
      status: 403,
      deniedBy: '/problems/out-of-scope',
      ...CONTEXT,
    };

    expect(classifyProblem(problem)).toStrictEqual({
      kind: 'denied',
      deniedBy: '/problems/out-of-scope',
    });
  });

  it('classifies a 400/422 with errors as field-errors', () => {
    const problem: ProblemDetails = {
      type: '/problems/invalid-value',
      title: 'Invalid value',
      status: 422,
      errors: { quarterDays: ['must be 1 to 4'] },
      ...CONTEXT,
    };

    expect(classifyProblem(problem)).toStrictEqual({
      kind: 'field-errors',
      errors: { quarterDays: ['must be 1 to 4'] },
    });
  });

  it('classifies a 409 with an invariant as conflict', () => {
    const problem: ProblemDetails = {
      type: '/problems/validated-cra-is-immutable',
      title: 'Cra is immutable',
      status: 409,
      invariant: '/problems/validated-cra-is-immutable',
      ...CONTEXT,
    };

    expect(classifyProblem(problem)).toStrictEqual({
      kind: 'conflict',
      invariant: '/problems/validated-cra-is-immutable',
    });
  });

  it('classifies a 409 as conflict even when it also carries errors, never field-errors', () => {
    // The exact shape `problemFromBusinessError`'s CONFLICT branch sends whenever the business
    // error has `details` — reproduced live against `POST /invoices/:id/issuance` on an
    // already-issued invoice hit with a fresh key (Phase 8, task 8.3): `invariant` AND `errors`
    // both set. The bug this guards: checking `errors` before `invariant` silently classifies
    // this as `field-errors`, and no screen renders a designed conflict for that kind.
    const problem: ProblemDetails = {
      type: '/problems/invoice-transition-not-allowed',
      title: 'InvoiceTransitionError',
      status: 409,
      invariant: '/problems/invoice-transition-not-allowed',
      errors: { invoiceId: ['inv-1'], from: ['issued'], attempted: ['issued'] },
      ...CONTEXT,
    };

    expect(classifyProblem(problem)).toStrictEqual({
      kind: 'conflict',
      invariant: '/problems/invoice-transition-not-allowed',
    });
  });

  it('classifies anything else as technical', () => {
    const problem: ProblemDetails = {
      type: API_PROBLEM_TYPES.internal,
      title: 'Internal error',
      status: 500,
      ...CONTEXT,
    };

    expect(classifyProblem(problem)).toStrictEqual({ kind: 'technical' });
  });
});
