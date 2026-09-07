import { problemDetailsSchema, type ProblemDetails } from '@erp/contracts';

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
 * case Annexe A does not settle: what a response becomes when its body is not the JSON its status
 * implied — a non-2xx without `application/problem+json` (a Vite proxy's own 502 page, an HTML
 * error document from somewhere in front of it), a 2xx that does not parse (Vite's SPA fallback) —
 * or when `fetch()` itself never got a response (offline, DNS failure, connection refused). Both are facts about the **transport**, not a refusal the API made, so they
 * get their own namespace rather than being reported as `API_PROBLEM_TYPES.internal` — which would
 * claim the server said something it never had the chance to say. `lib/labels.ts` carries their
 * French sentences, clearly marked client-originated; `docs/open-questions.md` (row of
 * 2026-08-24) records this as a judgement call for Phase 4 to revisit once `ErrorState` is built
 * and the two cases have had a real screen to be wrong on.
 */
export const CLIENT_PROBLEM_TYPES = {
  /** A response arrived and its body was not the JSON its status implied: a non-2xx without
   * `application/problem+json`, or a 2xx whose body does not parse. */
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
    detail: `The response from ${path} did not parse as the JSON its status implied — most likely a proxy or transport failure rather than a refusal the API made.`,
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
  /**
   * Package 10: forwarded verbatim to `fetch()`. Every read hook passes its `queryFn` context's
   * own `signal` here, so TanStack Query's `cancelRefetch` (on by default whenever a persona
   * switch invalidates an active query — see `features/session/hooks.ts`) actually aborts the
   * superseded network request instead of only marking it logically stale while it keeps running.
   * Typed `| undefined` explicitly, not just `?:` — every `fetchXxx` wrapper in each feature's
   * `api.ts` takes `signal?: AbortSignal` itself and forwards it straight through; under
   * `exactOptionalPropertyTypes`, a plain `?:` here would reject that forwarded `undefined` at
   * every one of those call sites, each needing its own `... : {}` splice for a value this
   * property already means to accept absent-or-not.
   */
  readonly signal?: AbortSignal | undefined;
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
  const { method = 'GET', body, headers = {}, signal } = request;

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
      ...(signal === undefined ? {} : { signal }),
    });
  } catch {
    // An aborted fetch (TanStack Query's own `cancelRefetch`, once it can reach the network via
    // `signal`) rejects the same way a genuine network failure does, and is reported the same
    // way: the caller that owns the signal is the query whose retryer already discarded this
    // fetch before it could settle (`query-core`'s `resolve`/`reject` are both guarded by
    // `isResolved()`, set synchronously by `cancel()`), so nothing downstream ever reads this
    // `ApiResult` — it is manufactured and thrown away. Special-casing abort here to avoid
    // producing it would only be for a reader's benefit, and this module's own header already
    // promises "never throws"; adding a second exception to that for a value nobody consumes
    // is not worth breaking the promise a reader can otherwise take at face value.
    return { ok: false, problem: networkFailureProblem(path) };
  }

  if (response.ok) {
    // Wrapped for the same reason the error path below is, and not only for symmetry: the module's
    // contract above is "this module never throws", and a 2xx whose body is not JSON is reachable
    // — Vite's SPA fallback answers **200** with `index.html` for any path missing from
    // `PROXIED_PATHS` (`vite.config.ts`), so one endpoint added to the API and not to that list
    // lands here with HTML and a success status.
    try {
      return { ok: true, value: await parseJson<T>(response) };
    } catch {
      return { ok: false, problem: unparsableResponseProblem(path, response.status) };
    }
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes(PROBLEM_JSON)) {
    return { ok: false, problem: unparsableResponseProblem(path, response.status) };
  }

  let errorBody: unknown;
  try {
    errorBody = await response.json();
  } catch {
    return { ok: false, problem: unparsableResponseProblem(path, response.status) };
  }

  // Package 09: the content type is not proof of the shape. An intermediary answering the right
  // header over the wrong body — or a future route this repository gets wrong — must not let an
  // unvalidated `.type` reach a caller that branches on it as if the API had said it.
  const parsed = problemDetailsSchema.safeParse(errorBody);
  if (!parsed.success)
    return { ok: false, problem: unparsableResponseProblem(path, response.status) };

  // `parsed.data`'s inferred type spells every optional field `T | undefined` — zod cannot know
  // from the schema alone that a key merely absent from real JSON never carries a literal
  // `undefined` — where `ProblemDetails`, under this repository's `exactOptionalPropertyTypes`,
  // spells the same field `T`, present or absent, never explicitly `undefined`. Both describe the
  // same runtime object; the cast (not a widening one — `parsed.success` just proved the shape)
  // is the one place that reconciles the two, the same reasoning `parseJson`'s own comment gives.
  return { ok: false, problem: parsed.data as ProblemDetails };
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
