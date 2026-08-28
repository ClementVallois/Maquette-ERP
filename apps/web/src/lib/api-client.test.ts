import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiFetch, ApiProblemError, CLIENT_PROBLEM_TYPES, unwrap } from './api-client.ts';

/**
 * The one property this module claims in its own header — **it never throws** — and the two ways
 * it could stop being true. Both are transport facts rather than refusals the API made, so both
 * must arrive as `{ok: false, problem}` and never as an untyped exception past the discriminated
 * result every `hooks.ts` reads.
 *
 * `globalThis.fetch` is stubbed rather than a server started: these are assertions about the
 * wrapper's own branches, and the live API is exercised where it belongs — `e2e/personas-live.spec.ts`,
 * Phase 3's Gate.
 */

function jsonResponse(body: unknown, status: number, contentType: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiFetch', () => {
  it('returns the parsed value on a 2xx', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse({ persona: null }, 200, 'application/json'))),
    );

    const result = await apiFetch<{ persona: null }>('/api/v1/session');

    expect(result).toStrictEqual({ ok: true, value: { persona: null } });
  });

  it('returns the API problem on a non-2xx that carries problem+json', async () => {
    const problem = { type: '/problems/out-of-scope', title: 'Out of scope', status: 403 };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(problem, 403, 'application/problem+json'))),
    );

    const result = await apiFetch('/api/v1/cras/x');

    expect(result).toStrictEqual({ ok: false, problem });
  });

  it('does not throw on a 2xx whose body is not JSON, which Vite’s SPA fallback produces', async () => {
    // A path missing from `vite.config.ts`'s `PROXIED_PATHS` is answered by the dev server itself:
    // status 200, body `index.html`. Parsed as JSON that is a `SyntaxError`, and before this was
    // wrapped it escaped `apiFetch` untyped — the module's header promises it cannot.
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response('<!doctype html><title>app</title>', {
            status: 200,
            headers: { 'content-type': 'text/html' },
          }),
        ),
      ),
    );

    const result = await apiFetch('/api/v1/added-to-the-api-but-not-to-the-proxy');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.type).toBe(CLIENT_PROBLEM_TYPES.unparsableResponse);
    expect(result.problem.status).toBe(200);
  });

  it('reports a rejected fetch as the network-failure sentinel, with no status to report', async () => {
    class Refused extends Error {}
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new Refused('connection refused'))),
    );

    const result = await apiFetch('/api/v1/personas');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problem.type).toBe(CLIENT_PROBLEM_TYPES.networkFailure);
    expect(result.problem.status).toBe(0);
  });
});

describe('unwrap', () => {
  it('throws a typed ApiProblemError carrying the problem, never a bare Error', async () => {
    const problem = { type: '/problems/no-persona', title: 'No persona selected', status: 401 };
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(jsonResponse(problem, 401, 'application/problem+json'))),
    );

    const result = await apiFetch('/api/v1/cras');

    expect(() => unwrap(result)).toThrow(ApiProblemError);
    try {
      unwrap(result);
      expect.unreachable('unwrap must throw on a refusal');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiProblemError);
      expect((error as ApiProblemError).problem).toStrictEqual(problem);
    }
  });
});
