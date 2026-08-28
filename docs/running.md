# Running it locally

Two topologies, and the difference between them is one environment variable. ADR-0063 fixes them
(§ "Task 0.3"); this document is the operating instructions for both, plus the one failure that
follows from getting them mixed up.

- **dev** — Vite serves the SPA on `http://127.0.0.1:5173` and proxies `/api`, `/facture/`,
  `/releve/`, `/healthz` and `/readyz` to Fastify on 3000. Two processes. Hot reload on both sides.
  **The browser's origin is 5173.**
- **prod / demo** — Fastify serves `apps/web/dist` itself. One process, one origin,
  `http://127.0.0.1:3000`. No hot reload: the SPA is a build. This is what the deployed instance
  runs, and the only topology that sends the application's own CSP (ADR-0072).

Everything else — database, migrations, seed, personas — is identical in both.

## Why the variable matters

`API_PUBLIC_ORIGIN` is **the origin the browser presents**, not the port Fastify listens on. Every
state-changing request (`POST`, `PUT`, `PATCH`, `DELETE`) whose `Origin` header is not exactly that
value is refused `403 /problems/forbidden-origin` — the second CSRF control of ADR-0023, alongside
`SameSite=Strict`, and there is no CORS. `apps/api/src/personas/access.ts` carries the check.

So the value follows the topology: `http://127.0.0.1:5173` in dev, `http://127.0.0.1:3000` in
prod/demo.

The two files disagree on it **on purpose**, decided 27/08/2026 in front-end plan task 9.5 (the row
is in the `Settled` table of [`open-questions.md`](open-questions.md), commit `cacdf3c`):

| File                       | Value                   | Because                                               |
| -------------------------- | ----------------------- | ----------------------------------------------------- |
| `.env.example` (tracked)   | `http://127.0.0.1:3000` | the topology `pnpm run setup` leaves a fresh clone in |
| `.env` (local, gitignored) | `http://127.0.0.1:5173` | a dev session edits this one line and nothing else    |

## Once, for either topology

```sh
pnpm install --frozen-lockfile
pnpm run setup      # .env, its check, PostgreSQL via docker compose, migrations, seed
```

`pnpm run db:reset` replays the database from empty at any point.

## Dev topology

Two terminals, and browse **5173**:

```sh
pnpm run api:dev              # Fastify on 3000, --watch
pnpm --filter @erp/web dev    # Vite on 5173 — this is the URL you open
```

Nothing to configure if `.env` already carries `API_PUBLIC_ORIGIN=http://127.0.0.1:5173`, which is
what a dev session sets it to.

Opening **3000** in this configuration is the mistake this document exists for: the shell may load
(if a `dist/` happens to be present), and then the first write — picking a persona — answers 403.
See below.

## Prod / demo topology

The SPA has to be built first: Fastify serves `apps/web/dist` as it finds it, and a `dist/` older
than the sources fails silently.

```sh
pnpm --filter @erp/web build
API_PUBLIC_ORIGIN=http://127.0.0.1:3000 pnpm run api
```

Then browse **<http://127.0.0.1:3000>**.

The prefixed variable is not decoration: it means **no edit to `.env`**. Node's
`--env-file-if-exists` never overrides a variable already present in the environment, so the prefix
wins over the file for that one run and the dev value stays where it is. (`playwright.config.ts`
relies on the same thing for its served-build project.) Editing `.env` back to 3000 works too — it
just has to be edited back afterwards.

The API prints the origin it will accept on startup:
`{"origin":"http://127.0.0.1:3000","msg":"open this url"}`. That line is the authority; if it does
not match the URL in the address bar, writes will be refused.

## When a write answers 403

The symptom is a screen that looks fine and a button that does nothing.

| What you see                                                                             | What it is                                                           | Fix                                                                             |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `403 /problems/forbidden-origin`, log `{"origin":"mismatched"}`                          | browsing 3000 with `API_PUBLIC_ORIGIN=…:5173`, or the reverse        | browse the origin the startup log prints, or start the API with the other value |
| Same, on `http://localhost:3000`                                                         | `localhost` and `127.0.0.1` are the same machine and **two origins** | use `127.0.0.1` — reads work under `localhost`, only writes break               |
| `403 /problems/forbidden-origin`, log `{"origin":"absent"}` or `{"origin":"suppressed"}` | a client that sends no `Origin`, or a browser told to withhold it    | `curl` needs `-H 'Origin: …'` on every write; `Origin: null` is refused too     |
| `400 /problems/idempotency-key-required` on invoice issuance                             | expected — the only route that consumes a gapless number             | add `-H 'Idempotency-Key: …'`                                                   |
| `403 /problems/insufficient-role`                                                        | expected — the authorization model working                           | switch persona (issuance is `billing`, validation is `manager`)                 |

**`pnpm run check` does not catch an origin mismatch.** `scripts/env-drift.ts` compares the _key
sets_ of `.env`, `.env.example` and `compose.yml` — never their values — so the whole gate stays
green while every write is refused. That is why this failure reads as a bug in the application
rather than as a misconfiguration.

## End-to-end tests, in both

```sh
pnpm --filter @erp/web exec playwright test                      # dev topology (default)
E2E_SERVED_BUILD=1 pnpm --filter @erp/web exec playwright test   # prod/demo, builds dist itself
```

Playwright starts and stops its own servers (`webServer` in `apps/web/playwright.config.ts`) and, in
the served-build mode, sets `API_PUBLIC_ORIGIN` for the run the same way this document does — which
is why neither mode needs `.env` touched.
