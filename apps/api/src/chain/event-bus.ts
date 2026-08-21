import type { DomainEvent, EventBus, EventHandler } from '@erp/platform';

/**
 * The bus ADR-0001 assumes: in-process, synchronous, and running **inside** the emitter's
 * transaction. That is the whole reason a subscriber may perform no I/O outside it — publishing
 * is not a hand-off, it is a function call the emitter is still inside.
 *
 * It is built per unit of work rather than once at startup. A long-lived bus would outlive the
 * transaction its subscribers write through, which is exactly the confusion an outbox exists to
 * resolve — and ADR-0020 names the day a subscriber needs I/O outside the transaction as the
 * threshold for building one.
 *
 * A handler that throws propagates. There is no `catch` here on purpose: swallowing a subscriber's
 * failure would let the Cra commit while the invoice it owes does not, which is the one thing
 * `docs/BUILD-RULES.md` says must not happen.
 */
export function inProcessEventBus(): EventBus {
  const handlers = new Map<string, EventHandler<DomainEvent>[]>();

  return {
    subscribe(type, handler) {
      const existing = handlers.get(type) ?? [];
      existing.push(handler as EventHandler<DomainEvent>);
      handlers.set(type, existing);
    },

    async publish(event) {
      for (const handler of handlers.get(event.type) ?? []) {
        await handler(event);
      }
    },
  };
}
