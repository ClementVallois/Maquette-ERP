import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import {
  broadcastPersonaChange,
  installCrossTabPersonaSync,
  PERSONA_CHANGE_STORAGE_KEY,
  type PersonaBroadcastEvent,
} from './cross-tab-sync';

/**
 * Package 10's evidence: a second browser tab, open on this same origin with its own independent
 * `QueryClient`, learns nothing when a persona mutation succeeds in a different tab — nothing
 * connects the two but the cookie jar the API reads. This file is the "another tab" half of the
 * package's own Work item, "define how another tab changing the shared cookie invalidates a tab's
 * cached persona and business data" — the same-tab half (`invalidateOnPersonaChange`'s two
 * `refetchType` branches) is unit-tested already, indirectly, by `session-guard.test.ts`'s own
 * fake-`QueryClient` mutations.
 *
 * `QueryObserver` stands in for a mounted component the same way `session-guard.test.ts` stands up
 * a real `QueryClient` for a fake redirect — no React, no `@testing-library/react` (this
 * repository has neither), and it is the same primitive `useQuery` itself is built on, not an
 * approximation of it. `installCrossTabPersonaSync`'s injectable `subscribe` (and
 * `broadcastPersonaChange`'s `writeTimestamp`) let this file drive the exact listener the real
 * `window`/`localStorage` wiring would call, without needing either — the same reasoning
 * `docs/adr/0112-persona-changes-broadcast-across-tabs-through-storage.md` gives for choosing
 * this over a second Playwright browser tab.
 */

function newQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

/** A fake two-way "storage" channel: `dispatch` plays the part of another tab's write reaching
 * this one, and `subscribe` is what `installCrossTabPersonaSync` is handed in place of the real
 * `window.addEventListener('storage', ...)`. */
function fakeBroadcastChannel(): {
  subscribe: (listener: (event: PersonaBroadcastEvent) => void) => () => void;
  dispatch: (key: string | null) => void;
} {
  const listeners = new Set<(event: PersonaBroadcastEvent) => void>();
  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch: (key) => {
      for (const listener of listeners) listener({ key });
    },
  };
}

describe('installCrossTabPersonaSync', () => {
  it('ignores a broadcast for an unrelated key', async () => {
    const queryClient = newQueryClient();
    const queryFn = vi.fn(() => Promise.resolve('first'));
    const observer = new QueryObserver(queryClient, { queryKey: ['probe'], queryFn });
    const unsubscribeObserver = observer.subscribe(() => undefined);
    await vi.waitFor(() => {
      expect(queryFn).toHaveBeenCalledTimes(1);
    });

    const channel = fakeBroadcastChannel();
    const uninstall = installCrossTabPersonaSync(queryClient, channel.subscribe);
    channel.dispatch('some-other-key');

    // No `vi.waitFor` to hang on here — this asserts nothing happens, so it has to wait an actual
    // tick and check the call count did not move.
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
    expect(queryFn).toHaveBeenCalledTimes(1);

    uninstall();
    unsubscribeObserver();
  });

  it('refetches this tab’s active query when another tab broadcasts a persona change', async () => {
    const queryClient = newQueryClient();
    const queryFn = vi.fn(() => Promise.resolve('answer'));
    const observer = new QueryObserver(queryClient, { queryKey: ['probe'], queryFn });
    const unsubscribeObserver = observer.subscribe(() => undefined);
    // Waits for the query to have actually *settled* (`isSuccess`), not merely for `queryFn` to
    // have been called: a mock that resolves immediately can still be one microtask away from
    // `query-core` writing that result into the query's own state (`Query.fetch()`'s `setData`
    // runs after its own `await this.#retryer.start()`, a further tick past the retryer's
    // internal resolution) — dispatching before that settles would race this test's own setup,
    // not the behavior under test.
    await vi.waitFor(() => {
      expect(observer.getCurrentResult().isSuccess).toBe(true);
    });

    const channel = fakeBroadcastChannel();
    const uninstall = installCrossTabPersonaSync(queryClient, channel.subscribe);
    channel.dispatch(PERSONA_CHANGE_STORAGE_KEY);

    await vi.waitFor(() => {
      expect(queryFn).toHaveBeenCalledTimes(2);
    });

    uninstall();
    unsubscribeObserver();
  });

  it(
    'a delayed response held open before another tab’s persona change never overwrites ' +
      'the refetch that change triggered',
    async () => {
      // The genuinely load-bearing test: an old-persona fetch that is still in flight when the
      // broadcast arrives, and only resolves — with stale data — after the new fetch has already
      // started. Before this package, nothing in this tab would even react to the broadcast, so
      // the stale value would land in the cache uncontested; with `installCrossTabPersonaSync`
      // wired, TanStack Query's own `cancelRefetch` (default `true`) discards it instead — a
      // guarantee `docs/adr/0112-...md` verifies by reading `query-core`'s own retryer source
      // rather than assuming it.
      const queryClient = newQueryClient();
      let resolveStale: (value: string) => void = () => undefined;
      const queryFn = vi
        .fn<() => Promise<string>>()
        .mockImplementationOnce(
          () =>
            new Promise<string>((resolve) => {
              resolveStale = resolve;
            }),
        )
        .mockImplementationOnce(() => Promise.resolve('after-switch'));

      const observer = new QueryObserver(queryClient, { queryKey: ['probe'], queryFn });
      const unsubscribeObserver = observer.subscribe(() => undefined);
      await vi.waitFor(() => {
        expect(queryFn).toHaveBeenCalledTimes(1);
      });

      const channel = fakeBroadcastChannel();
      const uninstall = installCrossTabPersonaSync(queryClient, channel.subscribe);
      channel.dispatch(PERSONA_CHANGE_STORAGE_KEY);

      await vi.waitFor(() => {
        expect(queryFn).toHaveBeenCalledTimes(2);
      });

      // Only now does the held-open first request resolve — after the second one is already under
      // way. A correct implementation must never let this land in the cache.
      resolveStale('before-switch');

      await vi.waitFor(() => {
        expect(queryClient.getQueryData(['probe'])).toBe('after-switch');
      });
      // Give the stale promise's own microtask queue a further tick to (fail to) sneak in behind
      // the assertion above, rather than trusting a single readback the instant it turns true.
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      expect(queryClient.getQueryData(['probe'])).toBe('after-switch');

      uninstall();
      unsubscribeObserver();
    },
  );
});

describe('broadcastPersonaChange', () => {
  it('writes a timestamp through the injected sink', () => {
    const writeTimestamp = vi.fn();

    broadcastPersonaChange(writeTimestamp);

    expect(writeTimestamp).toHaveBeenCalledTimes(1);
    expect(writeTimestamp).toHaveBeenCalledWith(expect.stringMatching(/^\d+$/));
  });
});
