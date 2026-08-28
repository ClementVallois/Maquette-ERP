import type { ProblemDetails } from '@erp/contracts';

/**
 * The days a refused submission named, off `/problems/cra-incomplete` (front-end plan §6.5: "un
 * `IncompleteCraError` au submit désigne les jours en cause dans la ligne de totaux").
 *
 * The double encoding is not a guess: `apps/api/src/http/problem.ts`'s `asErrors` maps every field
 * of a `BusinessError`'s details to `[readable(value)]`, and `readable` runs a non-string through
 * `JSON.stringify`. So `IncompleteCraError`'s `missingDays: string[]` reaches the wire as a
 * one-element array holding the JSON text of the array. Parsed here rather than assumed: anything
 * that is not a list of strings yields an empty set and the grid simply shows no server-side
 * flags, which is the pre-existing behaviour.
 */
const CRA_INCOMPLETE = '/problems/cra-incomplete';

export function missingDaysFrom(problem: ProblemDetails | null): ReadonlySet<string> {
  // `problem?.type` rather than a null check first: `undefined !== CRA_INCOMPLETE` holds, so a
  // null refusal leaves through the same door as a refusal of another type.
  if (problem?.type !== CRA_INCOMPLETE) return new Set();

  const encoded = problem.errors?.['missingDays']?.[0];
  if (encoded === undefined) return new Set();

  let parsed: unknown;
  try {
    parsed = JSON.parse(encoded);
  } catch {
    return new Set();
  }

  if (!Array.isArray(parsed)) return new Set();

  return new Set(parsed.filter((day): day is string => typeof day === 'string'));
}
