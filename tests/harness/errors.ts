/**
 * The harness is misconfigured: a connection string is missing, or a test reached for the
 * transaction outside the hooks that open it. Always a setup fault, never a retryable one — the
 * same run will fail the same way until the environment or the test changes.
 *
 * A local class rather than `TechnicalFailure` from `@erp/platform`: the harness deliberately
 * carries no workspace dependency, so that it stays usable by any package without creating an
 * arrow between them. What `docs/BUILD-RULES.md` bans is the *bare* `Error`, not the absence of
 * the kernel.
 */
export class HarnessMisconfiguredError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = 'HarnessMisconfiguredError';
  }
}
