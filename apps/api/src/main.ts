import { compose } from './composition.ts';
import { loadConfig } from './config.ts';
import { buildServer } from './server.ts';

/**
 * The executable. Everything decidable lives elsewhere so it can be tested; what is here is the
 * order in which things start and, more importantly, the order in which they stop.
 *
 * Shutdown is server first, then the pool. The other order closes connections out from under
 * requests that are still being answered, which turns a graceful shutdown into a burst of 500s
 * and — for the chain this application exists for — a transaction killed between the CRA and its
 * invoice.
 */

const SIGNALS = ['SIGTERM', 'SIGINT'] as const;
const CONFIGURATION_REFUSED = 78; // EX_CONFIG, sysexits.h
const START_FAILED = 1;

async function start(): Promise<void> {
  const config = loadConfig(process.env);
  const { pool, dependencies } = compose(config);
  const app = buildServer(dependencies);

  let stopping = false;
  const stop = (signal: string): void => {
    if (stopping) return;
    stopping = true;

    app.log.info({ signal }, 'shutting down');

    void app
      .close()
      .then(async () => pool.end())
      .then(() => {
        app.log.info('shutdown complete');
      })
      .catch((error: unknown) => {
        app.log.error({ err: error }, 'shutdown failed');
        process.exitCode = START_FAILED;
      });
  };

  for (const signal of SIGNALS)
    process.on(signal, () => {
      stop(signal);
    });

  await app.listen({ host: config.host, port: config.port });

  // Fastify's own line names the address it bound. This one names the origin, which is what a
  // reader has to type: a write sent to any other origin is refused (ADR-0023), and `localhost`
  // and `127.0.0.1` are the same machine under two different origins.
  app.log.info({ origin: config.publicOrigin }, 'open this url');
}

try {
  await start();
} catch (error) {
  // The logger may not exist yet — a configuration refusal happens before it is built — so this
  // one message goes to stderr directly. It names the variable, never the value (see config.ts).
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(
    error instanceof Error && error.name === 'ConfigurationError'
      ? CONFIGURATION_REFUSED
      : START_FAILED,
  );
}
