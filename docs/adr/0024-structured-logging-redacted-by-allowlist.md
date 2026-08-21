# ADR-0024 — Structured logging, redacted by allowlist in the serialiser

- **Date**: 2026-08-19
- **Status**: accepted

## Context

`docs/BUILD-RULES.md` has said since Phase 0: "No secret in a log, an error response or a stack
trace. Redaction happens in the serialiser, by allowlist — never at the call site." Until this
phase there was no logger, so the rule pointed at nothing. It now has to be built, and the two
halves of that sentence are separate decisions that are easy to conflate.

The material at risk here is not hypothetical. `DATABASE_URL` carries a password. The persona
cookie carries a signed session and travels in a `Cookie` request header and a `Set-Cookie`
response header. A `pg` error's `cause` carries the failing query, and on a connection failure the
connection options — including the password. A query string is copied into access logs, referrer
headers and proxy caches. Every one of those is on an object a logger is routinely handed whole.

The instance is public and the firm sells cybersecurity, so a leaked value in a log line is not a
tidy-up item; it is the finding that discredits the rest of the repository.

## Decision

**pino, and no other observability dependency.** No OpenTelemetry, no APM agent, no log shipper.
Fastify already carries pino, and declaring it directly resolves to the single copy Fastify uses
rather than a second one.

**JSON on stdout, and nothing else.** No file, no rotation, no transport: the process writes to
stdout and the host decides. That is what makes the container of Phase 8 a container rather than
a machine with a logging subsystem inside it.

**Redaction is an allowlist in the serialiser, and the direction is the whole decision.** Every
serialiser builds a **fresh object out of named fields**. Nothing is copied wholesale and then
subtracted. Concretely:

- a request contributes `id`, `method`, `path` and the **names** of its query parameters — never a
  value, never a header, never a body;
- a reply contributes `statusCode`, and nothing else;
- an error contributes `type`, `message`, `stack`, plus `problemType` and `details` when it is a
  `BusinessError`, plus `retryable` when it is a `TechnicalFailure`.

**`cause` is excluded by name, and it is the one exclusion worth arguing.** It is the field a
driver puts its connection options in. Excluding it costs a debugging hop on an infrastructure
failure; including it puts the database password in the log the first time Postgres refuses a
connection.

**`details` is published for a business error and not for a technical one.** ADR-0016 makes
`details` "the business fields of the refusal" by construction, so a business error's details are
safe by contract. A technical failure has no such contract, and an arbitrary `details` bolted onto
one is not covered by anything.

**`correlationId` and `causationId` are the query keys of the audit trail**, and the log line and
the `domain_events` row carry the same values (ADR-0020). `request.id` **is** the correlation id: a
caller may supply one in `x-correlation-id`, and it is accepted **only** if it matches a UUID
shape — an arbitrary header echoed into every log line of a request is how a newline gets into a
log file. Every answer carries it back in the same header, so a bug report and a log line can be
matched.

## Rejected option

**pino's `redact` option** — a list of paths whose values are replaced with `[Redacted]`. It is
the built-in answer, it is one line of configuration, and it is a **denylist**. A denylist is
correct exactly until the next field is added: a `Set-Cookie` header, a new query parameter, a body
echoed into an error. The failure is silent, and it is discovered in the log where the value now
sits. The allowlist inverts the default, so the same omission produces a missing field in a log
line rather than a published secret. `BUILD-RULES.md` already required this; the ADR records why.

**Logging the whole request and reply objects**, which is what a logger does by default and what
every "add logging" pull request looks like. Rejected for the reason above, and it is the concrete
shape the denylist failure takes here.

**A secret registry** — the serialiser scrubs any substring equal to a value registered as secret.
It sounds stronger and it is weaker: it only catches the secrets somebody remembered to register,
it costs a scan of every string in every log line, and it produces the false confidence that
anything not scrubbed is safe.

## Reconsideration threshold

Reopen when a log has a second consumer — a SIEM, a shipper, an aggregator with its own schema. At
that point the field names become a contract with something outside this repository and are worth
a schema rather than a set of functions.

Reopen the `cause` exclusion the day a technical failure cannot be diagnosed from `type`, `message`
and `stack`. The answer then is not to publish `cause` whole, but to give `TechnicalFailure` a
`safeCause` that its author fills in deliberately.

Reopen the "no tracing" half at the first request that crosses a process boundary. `correlationId`
and `causationId` are a poor man's trace and they are enough while everything runs in one process
and one transaction.

## Consequences

The rule `BUILD-RULES.md` stated in the present tense since Phase 0 exists, and it is tested rather
than asserted: `logging.test.ts` hands the serialisers a request carrying a `Cookie` header, a reply
carrying `Set-Cookie`, a query string carrying a token and a technical failure whose `cause` holds a
connection string, and asserts that none of the four reaches the output.

The cost is that a field is absent from the logs until somebody adds it to a serialiser. That is
the direction of failure this ADR is choosing, and it is stated rather than discovered: debugging
occasionally needs a field that is not there, and the alternative was occasionally publishing one
that should not have been.

A second consequence, less obvious: because the serialisers are plain exported functions rather
than configuration, they are unit-testable without a logger, a server or a request. The property
"no secret in a log" is therefore checkable in milliseconds, which is what makes it a gate rather
than an intention.
