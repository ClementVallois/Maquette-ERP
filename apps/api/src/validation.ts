import { API_PROBLEM_TYPES, type ProblemDetails } from '@erp/contracts';
import type { z } from 'zod';

import type { ProblemContext } from './http/problem.ts';

/**
 * Zod **at the boundary only** (BUILD-PLAN 5.3). It answers one question — is this a request at
 * all — and it never restates a domain rule.
 *
 * The line is drawn by ADR-0042: a shape the route cannot parse is a 400 about the transport; a
 * value a domain rule refuses is a 422 raised by the module that owns the rule. So the schemas
 * here check types, presence and bounds that make a value *representable* (a period is
 * `YYYY-MM`, a page size is a positive integer) — never that a period is open, that a mission is
 * running, or that a rate exists. Duplicating those here would give the same wrong value two
 * different statuses depending on which check ran first.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: Record<string, string[]> };

export function parseInput<T>(schema: z.ZodType<T>, input: unknown): Parsed<T> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, value: result.data };

  return { ok: false, errors: fieldErrors(result.error) };
}

function fieldErrors(error: z.ZodError): Record<string, string[]> {
  const errors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const field = issue.path.length === 0 ? '(body)' : issue.path.map(String).join('.');
    (errors[field] ??= []).push(issue.message);
  }

  return errors;
}

const BAD_REQUEST = 400;

export function malformed(
  errors: Record<string, string[]>,
  context: ProblemContext,
): ProblemDetails {
  return {
    type: API_PROBLEM_TYPES.malformedRequest,
    title: 'Malformed request',
    status: BAD_REQUEST,
    detail: 'The request does not match the shape this route accepts.',
    errors,
    ...context,
  };
}
