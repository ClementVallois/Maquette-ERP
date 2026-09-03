# ADR-0032 — The public instance is a resettable demo

- **Date**: 2026-09-03
- **Status**: accepted

## Context

ADR-0023 deliberately replaces authentication with a selector through which any visitor can act
as one of four personas. That makes authorization easy to demonstrate, but it also means an
internet visitor can create, submit, validate and refuse records under those synthetic identities.
No data on the public instance can honestly be presented as durable or attributable to a person.

The deterministic seed from ADR-0022 already owns the whole demonstrator dataset. It validates its
input, deletes the existing rows and rebuilds them inside one database transaction, so readers see
either the old complete dataset or the new complete dataset. Until this phase, nothing decided who
runs it outside local development or what happens to visitor-created entries.

## Decision

**The hosted instance contains synthetic data only and is reset to the deterministic seed every
night. Visitor changes are disposable demo exhaust, not retained application state.**

The first deployment runs all migrations with the schema-owner credential, then runs the seed with
that same one-shot privilege, before the application is made ready. Every subsequent deployment
runs pending migrations before the replacement application receives traffic, but it does not seed:
a code release is not permission to erase a visitor's current demonstration in the middle of the
day.

A dedicated systemd timer performs the reset nightly in the host's `Europe/Paris` timezone. The
reset unit takes a restricted local `pg_dump`, runs pending migrations, then executes the existing
seed as a one-shot container. The seed's transaction is the reset boundary; failure rolls its data
changes back and leaves the last complete dataset readable. Dumps are operational escape hatches,
not user backups, and are kept as seven daily rotations under the root-only backup directory from
ADR-0030.

Every interactive screen and the persona entry point display a French banner saying that the data
is synthetic and resets nightly. The banner does not call the selector authentication. The
application sends `X-Robots-Tag: noindex, nofollow` on every response, including API and printable
documents; nginx repeats the policy for responses it generates itself. Synthetic invoices and
named fictional personas have no reason to enter a search index.

The reset schedule, last outcome and logs are visible through systemd. A failed reset is an
operational failure to inspect, not a reason to make the application unavailable: the previous
complete seed plus any visitor changes remains the least surprising fallback.

## Rejected option

**Keep visitor data indefinitely and moderate abuse.** Durable state would require real identity,
ownership, retention rules, deletion handling and an audit trail that distinguishes a visitor from
the persona they selected. None belongs to the Cra-to-invoice demonstration, and moderation would
spend ongoing human effort protecting data that has no business value.

**Reset on every deployment.** It is mechanically convenient because the migrator is already
running, but it couples data loss to an unrelated code release and can erase a demonstration at any
time of day. A named nightly window is predictable and keeps release and data-lifecycle authority
separate.

**Drop and recreate the database volume nightly.** It guarantees an empty database but introduces
avoidable downtime and a second reset implementation. The existing seed already clears every
owned table transactionally with the schema-owner role, and its deterministic fingerprint is tested;
using it makes the public reset exercise the same deliverable as local setup.

## Reconsideration threshold

Reopen at the first real user, the first non-synthetic datum, or the first promise that a visitor's
change will remain available after the nightly window. Any one requires production authentication,
explicit retention and recovery objectives, monitored off-host backups and a migration from demo
data rather than another reset.

Reopen the seven-dump local retention only when a measured restore exercise needs a longer rollback
window. Moving dumps off-host before real data exists would protect reproducible synthetic rows
against a host loss without improving the demonstrator; after the threshold above, off-host,
encrypted and monitored backups become mandatory instead of optional.

## Consequences

Every visitor can explore the full workflow without leaving permanent clutter for the next one,
and a vandalised state repairs itself within one nightly cycle. The warning and robot policy make
the instance's status visible both to humans and automated crawlers.

The public service intentionally offers no durability guarantee. A visitor working across the
reset window loses changes, and local dumps do not change that contract. The reset unit holds the
schema-owner credential briefly, so it remains a root-owned one-shot path and the long-running app
continues to lack migration or truncate privilege.
