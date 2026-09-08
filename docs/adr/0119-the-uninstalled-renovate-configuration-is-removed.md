# ADR-0119 — The uninstalled Renovate configuration is removed

- **Date**: 2026-09-08
- **Status**: accepted

## Context

ADR-0075 decided two artefacts at once: a committed `renovate.json5`, and the written
vulnerability-management procedure in `docs/vulnerability-management.md`. Its own Context states the
fact that undermines the first of the two — the Renovate GitHub App has never been installed on this
repository. No webhook, no bot pull request, not one run. The configuration was committed against a
future installation that was, at the time, blocked by the repository being private.

The repository became public on 03/09/2026, which removed that obstacle. The installation still did
not happen: it is a platform action taken by hand on github.com, and it was not taken. So the file
sat in the repository root describing a weekly cadence, grouped updates and ungated vulnerability
alerts, none of which had ever governed anything.

That is precisely the shape of claim this repository exists to refuse. ADR-0040 records the same
failure once already — a README that asserted five required status checks while branch protection
was not merely pending but unavailable. ADR-0075 saw the risk and answered it with prose: it
instructed the README to say the configuration was committed and the installation pending. Prose is
the weaker half of the answer, and it decayed exactly as prose does — a reader arriving today finds
a section describing a file, a link, and a cadence, and has to run `ls` to discover that the first
of the three is gone.

## Decision

`renovate.json5` is removed. This repository has **no automated dependency-update mechanism**, and
the README says so in one sentence rather than describing a configuration that never ran.

What remains is what actually executes: the `Dependency scan` CI gate (`pnpm audit --audit-level=high`
plus osv-scanner, no severity floor on the second), which fails on every push and every pull request
against a known vulnerability in a resolved dependency and locks the merge button; and
`docs/vulnerability-management.md`, the procedure for what happens when that gate goes red — who
decides, what the two outcomes are, and where an exception is recorded. Point 2 of ADR-0075 stands
unchanged; point 1 is superseded by this ADR.

## Rejected option

**Install the Renovate App and keep the configuration.** This is the option that makes the original
ADR-0075 true rather than deleting half of it, and on a repository with real dependency churn it is
the right one. It loses here for two reasons. First, it is not a code decision: installing a GitHub
App on an account is an execution action the owner performs outside this repository, and writing an
ADR that depends on someone else performing an untracked manual step is how the branch-protection
claim went wrong in the first place. Second, the value is thin at this size — a mockup with a pinned
lockfile, a single maintainer, and a security gate that already fails on a disclosed vulnerability
does not need a weekly batch of minor bumps opening pull requests nobody has a reason to merge. The
gate catches what matters; Renovate would mostly generate noise.

A second alternative — **keep the file and annotate it as inactive** — is what ADR-0075 effectively
chose, and it is what produced the situation this ADR corrects: a repository whose thesis is that
every claim in it is checkable does not keep a configuration file whose only honest annotation is
"this does nothing".

## Reconsideration threshold

Reopen when any one of these becomes true: a second person maintains this repository (a shared
codebase cannot rely on one maintainer noticing a CVE feed); the dependency count or churn makes
manual bumps a practical burden rather than an occasional one; or the `Dependency scan` gate goes red
twice in a quarter on vulnerabilities that a routine minor bump would already have carried. Any of
those three means the automation would be paying for itself, and the App gets installed **first**,
with an observed bot pull request, before the configuration comes back.

## Consequences

Dependency updates are manual and deliberate: a bump is a decision someone takes, with the ordinary
new-dependency review, not a batch to be waved through. The security floor does not move — the gate
that would have caught a vulnerable transitive dependency is the same gate as before, and it was
never Renovate's job.

The cost is the obvious one: a routine minor release can sit unnoticed until something else surfaces
it. On a repository of this size that is an acceptable trade, and it is the trade the reconsideration
threshold above is written to detect turning bad.
