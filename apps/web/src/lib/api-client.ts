import type { ProblemDetails } from '@erp/contracts';

/**
 * A thin, typed fetch wrapper (frontend-plan.md task 3.1). Same-origin (empty base — the Vite
 * proxy does the rest in dev, ADR-0063), `credentials: 'same-origin'` so the persona cookie
 * travels, JSON in and out.
 *
 * Every non-2xx response is parsed into a `ProblemDetails` and returned in a discriminated result
 * rather than thrown as an untyped exception — this module never throws. `lib/query-client.ts` and
 * every feature's `hooks.ts` are where a refusal becomes a TanStack Query error (via `unwrap`,
 * below, and the typed `ApiProblemError` it throws): this file's own contract stays "call it, read
 * `.ok`".
 */
export type ApiResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: ProblemDetails };

const PROBLEM_JSON = 'application/problem+json';

/**
 * `type` values this **client** invents, never sent by the API — the frontend-plan.md task 3.1
 * case Annexe A does not settle: what a non-2xx response becomes when its body is not
 * `application/problem+json` at all (a Vite proxy's own 502 page, an HTML error document from
 * somewhere in front of it) or when `fetch()` itself never got a response (offline, DNS failure,
 * connection refused). Both are facts about the **transport**, not a refusal the API made, so they
 * get their own namespace rather than being reported as `API_PROBLEM_TYPES.internal` — which would
 * claim the server said something it never had the chance to say. `lib/labels.ts` carries their
 * French sentences, clearly marked client-originated; `docs/open-questions.md` (row of
 * 2026-08-24) records this as a judgement call for Phase 4 to revisit once `ErrorState` is built
 * and the two cases have had a real screen to be wrong on.
 */
export const CLIENT_PROBLEM_TYPES = {
  /** A non-2xx response arrived but its body was not `application/problem+json` (or did not
   * parse as JSON at all). */
  unparsableResponse: '/problems/client-unparsable-response',
  /** `fetch()` itself rejected — no HTTP response ever existed to have a status. */
  networkFailure: '/problems/client-network-failure',
} as const;

/** No real HTTP status is 0; it marks "no response was ever received" on `CLIENT_PROBLEM_TYPES.networkFailure`. */
const NO_RESPONSE = 0;

function unparsableResponseProblem(path: string, status: number): ProblemDetails {
  return {
    type: CLIENT_PROBLEM_TYPES.unparsableResponse,
    title: 'Non-JSON error response',
    status,
    detail: `The response from ${path} did not carry application/problem+json — most likely a proxy or transport failure rather than a refusal the API made.`,
    instance: path,
  };
}

function networkFailureProblem(path: string): ProblemDetails {
  return {
    type: CLIENT_PROBLEM_TYPES.networkFailure,
    title: 'Network failure',
    status: NO_RESPONSE,
    detail: `fetch() failed calling ${path} before any HTTP response existed — offline, DNS, or connection refused.`,
    instance: path,
  };
}

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface ApiRequest {
  readonly method?: ApiMethod;
  readonly body?: unknown;
  readonly headers?: Readonly<Record<string, string>>;
}

/**
 * `response.json()` is typed `Promise<any>` by `lib.dom.d.ts`; the assertion below is the one
 * place that turns it into `T`, so every caller of `apiFetch` gets a typed value without its own
 * cast. Isolated here rather than inlined at each call site, per the repository's
 * `consistent-type-assertions` rule and so a reviewer checking every `as` in this file finds this
 * one first.
 */
async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function apiFetch<T>(path: string, request: ApiRequest = {}): Promise<ApiResult<T>> {
  const { method = 'GET', body, headers = {} } = request;

  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return { ok: false, problem: networkFailureProblem(path) };
  }

  if (response.ok) {
    return { ok: true, value: await parseJson<T>(response) };
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes(PROBLEM_JSON)) {
    return { ok: false, problem: unparsableResponseProblem(path, response.status) };
  }

  try {
    return { ok: false, problem: await parseJson<ProblemDetails>(response) };
  } catch {
    return { ok: false, problem: unparsableResponseProblem(path, response.status) };
  }
}

/**
 * A typed technical failure (BUILD-RULES § Working discipline: never a bare `new Error()`),
 * wrapping the `ProblemDetails` the API — or this module's own synthesis above — produced. This is
 * the one exception to "this module never throws": `unwrap` is the seam every `hooks.ts` calls at,
 * so TanStack Query's own error channel receives a typed value rather than an untyped throw.
 */
export class ApiProblemError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(`API refused: ${problem.type} (${String(problem.status)})`);
    this.name = 'ApiProblemError';
    this.problem = problem;
  }
}

/** `result.ok` ? the value : throws `ApiProblemError`. The seam between `ApiResult` and TanStack Query. */
export function unwrap<T>(result: ApiResult<T>): T {
  if (result.ok) return result.value;

  throw new ApiProblemError(result.problem);
}
