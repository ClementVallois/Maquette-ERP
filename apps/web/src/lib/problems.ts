import { API_PROBLEM_TYPES, type ProblemDetails } from '@erp/contracts';

import { LABELS } from './labels.ts';

/**
 * Branch on `problem.type`, never on `problem.status` (frontend-plan.md §2 and task 3.2). This
 * module holds the pure classification and the two French-sentence lookups Phase 4's screens
 * consume (`ErrorState`, `DeniedState`, the shell's session guards); it renders nothing itself —
 * `apps/web/src/components/feedback/` (Phase 4) is where a `ProblemAction` becomes JSX.
 */

const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const UNPROCESSABLE = 422;

/**
 * What a screen does with a refusal, per frontend-plan.md task 3.2's five branches.
 *
 * The two session-cookie cases are checked by `type` before anything else, and only one of them
 * needs it: `unknown-persona` is a **403 carrying `deniedBy`** (`apps/api/src/personas/access.ts`
 * sets both to the same value), so a generic "has `deniedBy`" check reached first would
 * misclassify it as an ordinary `DeniedState` and skip the cookie purge it needs. `no-persona` is
 * a **401 with no `deniedBy` at all** and would fall through to `technical` rather than to
 * `denied`; it is checked here beside its sibling because the two are one screen decision — go
 * back to the selector — not because the fall-through would be a refusal.
 */
export type ProblemAction =
  | { readonly kind: 'redirect-to-selector' }
  | { readonly kind: 'unknown-persona' }
  | { readonly kind: 'denied'; readonly deniedBy: string }
  | { readonly kind: 'field-errors'; readonly errors: Readonly<Record<string, readonly string[]>> }
  | { readonly kind: 'conflict'; readonly invariant: string }
  | { readonly kind: 'technical' };

export function classifyProblem(problem: ProblemDetails): ProblemAction {
  if (problem.type === API_PROBLEM_TYPES.noPersona) return { kind: 'redirect-to-selector' };
  if (problem.type === API_PROBLEM_TYPES.unknownPersona) return { kind: 'unknown-persona' };

  // out-of-scope, insufficient-role, forbidden-origin: three different rules, one screen — all
  // carry `deniedBy` (BUILD-RULES § Authorization: "a 403 names the rule"), which is what a
  // `DeniedState` needs to render.
  if (problem.deniedBy !== undefined) return { kind: 'denied', deniedBy: problem.deniedBy };

  // `invariant` before `errors`, not after: every 409 this API sends carries both whenever the
  // business error has `details` (`http/problem.ts`'s `problemFromBusinessError`, the CONFLICT
  // branch — `invariant: error.problemType, ...asErrors(error.details)`), and a 422's own `errors`
  // never comes with an `invariant` at all (the same function's UNPROCESSABLE branch sets only
  // `errors`). Checking `errors` first — this file's own order until Phase 8 found it live,
  // issuing an invoice a second time with a fresh key — silently swallowed every 409 that also
  // carried structured detail fields into `field-errors`, a kind no screen renders as a designed
  // conflict; `problems.test.ts`'s "conflict" fixture never set `errors` alongside `invariant`, so
  // nothing caught it. `invariant` first is safe unconditionally: a 422 with `errors` never
  // acquires one on the way here to be mis-ordered against.
  if (problem.invariant !== undefined) return { kind: 'conflict', invariant: problem.invariant };
  if (problem.errors !== undefined) return { kind: 'field-errors', errors: problem.errors };

  return { kind: 'technical' };
}

/**
 * The heading for a refusal, by status — mirrors `apps/api/src/web/problem-page.ts`'s
 * `headingFor`. Falls back to `malformed` for anything not named below (400 and the rest), same as
 * the SSR page.
 */
export function headingFor(problem: ProblemDetails): string {
  if (problem.status === FORBIDDEN) return LABELS.problem.heading.denied;
  if (problem.status === NOT_FOUND) return LABELS.problem.heading.notFound;
  if (problem.status === CONFLICT) return LABELS.problem.heading.conflict;
  if (problem.status === UNPROCESSABLE) return LABELS.problem.heading.invalid;
  if (problem.type === API_PROBLEM_TYPES.internal) return LABELS.problem.heading.internal;

  return LABELS.problem.heading.malformed;
}

/**
 * The French sentence for a refusal (the SPA's ADR-0060). `problem.title` and `problem.detail` are
 * deliberately never rendered — see `lib/labels.ts`'s header for why. A `type` with no entry in
 * `LABELS.problem.sentences` falls back to the heading, never to the English `title`.
 */
export function sentenceFor(problem: ProblemDetails): string {
  // Widened here rather than at the declaration, matching `problem-page.ts`: `LABELS` stays
  // `as const` so a reader can see every string it holds at the source, and an index signature on
  // the table itself would take that away for the sake of one lookup function.
  const sentences: Readonly<Record<string, string>> = LABELS.problem.sentences;

  return sentences[problem.type] ?? headingFor(problem);
}
