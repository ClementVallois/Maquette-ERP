import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiProblemError } from '@/lib/api-client';

import {
  installSessionGuard,
  resetSessionGuardForTest,
  SESSION_INVALIDATED_SEARCH,
} from './session-guard';

function jsonResponse(body: unknown, status: number, contentType: string): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': contentType } });
}

function newQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

async function failWith(queryClient: QueryClient, key: string, problem: object): Promise<void> {
  await queryClient
    .fetchQuery({
      queryKey: [key],
      queryFn: (): never => {
        throw new ApiProblemError(problem as never);
      },
    })
    .catch(() => undefined);
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetSessionGuardForTest();
});

describe('installSessionGuard', () => {
  it('purges the cookie and redirects to the selector, carrying the reason, on unknown-persona', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ persona: null }, 200, 'application/json')),
    );
    vi.stubGlobal('fetch', fetchMock);
    const queryClient = newQueryClient();
    const redirect = vi.fn();
    installSessionGuard(queryClient, redirect);

    await failWith(queryClient, 'a', {
      type: '/problems/unknown-persona',
      title: 'Unknown persona',
      status: 403,
      deniedBy: '/problems/unknown-persona',
    });
    // `clearPersona()` chains through `apiFetch` (its own `fetch` → `.json()` → `unwrap` hops)
    // before `.finally(redirectToSelector)` runs — `vi.waitFor` polls rather than guessing a tick
    // count, the same discipline rule 0bis.9 asks of Playwright waits, applied to a unit test.
    await vi.waitFor(() => {
      expect(redirect).toHaveBeenCalledTimes(1);
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/session/persona',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(redirect).toHaveBeenCalledWith(SESSION_INVALIDATED_SEARCH);
  });

  it('redirects without a purge on no-persona', async () => {
    const queryClient = newQueryClient();
    const redirect = vi.fn();
    installSessionGuard(queryClient, redirect);

    await failWith(queryClient, 'b', {
      type: '/problems/no-persona',
      title: 'No persona selected',
      status: 401,
    });

    expect(redirect).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith();
  });

  it('does nothing for an ordinary refusal — this is not a catch-all error handler', async () => {
    const queryClient = newQueryClient();
    const redirect = vi.fn();
    installSessionGuard(queryClient, redirect);

    await failWith(queryClient, 'c', {
      type: '/problems/out-of-scope',
      title: 'Out of scope',
      status: 403,
      deniedBy: '/problems/out-of-scope',
    });

    expect(redirect).not.toHaveBeenCalled();
  });

  it('fires at most once, even if two requests fail with a session problem in the same tick', async () => {
    const queryClient = newQueryClient();
    const redirect = vi.fn();
    installSessionGuard(queryClient, redirect);

    await Promise.allSettled([
      failWith(queryClient, 'd', {
        type: '/problems/no-persona',
        title: 'No persona selected',
        status: 401,
      }),
      failWith(queryClient, 'e', {
        type: '/problems/no-persona',
        title: 'No persona selected',
        status: 401,
      }),
    ]);

    expect(redirect).toHaveBeenCalledTimes(1);
  });
});
