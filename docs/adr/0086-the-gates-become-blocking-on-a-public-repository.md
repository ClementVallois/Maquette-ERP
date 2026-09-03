# ADR-0086 — The gates become blocking, because the repository is public

- **Date**: 2026-09-03
- **Status**: accepted
- **Supersedes**: ADR-0040

## Context

ADR-0040 recorded a failure of a claim rather than a design choice. The README said five checks were
_required_ by branch protection on `main`; opening the first pull request returned
`403 "Upgrade to GitHub Pro or make this repository public to enable this feature."` Branch
protection is the only mechanism that disables the merge button, it was unavailable, and so — by
this repository's own definition, "a gate that does not block a merge is a warning, not a gate" —
every one of its gates was a warning. ADR-0040 chose the honest description over the flattering one
and said so in the README.

Its reconsideration threshold was the repository becoming public or moving to a paid plan. On
03/09/2026 the repository was made public, for an unrelated reason: `BUILD-PLAN` 8.5 asks for
provenance attestation on the published image, and GitHub refuses to persist an attestation for a
user-owned private repository. The threshold fired as a side effect of Phase 8's supply-chain
requirement.

## Decision

**Branch protection is enabled on `main`, with every CI job required. The gates block the merge
button, and the repository's first claim is mechanical rather than authorial.**

Direct pushes to `main` stop working, including the author's. Every change reaches `main` through a
pull request whose checks are green — which is what the build has done by hand since Phase 0, now
held by the platform instead of by discipline.

CodeQL joins the same reasoning in the same pass (`.github/workflows/codeql.yml`). Its absence had
one cause and one only: code scanning needs Advanced Security on a private repository, and
`ci.yml`'s SAST job said in as many words "revisit once it is public". Semgrep stays alongside it —
it is fast enough for the PR pipeline and the two tools do not find the same things.

## Rejected option

**Keep the gates advisory now that the choice is real rather than forced.** This is the tempting
one, because nothing in the daily loop improves: the author already refuses to merge red, so
protection changes no behaviour on a one-person repository. It loses on what the repository is
_for_. Its headline claim is that a module boundary is enforced by CI and not by naming
conventions, and "enforced" carried an asterisk that a reader had to reach ADR-0040 to find. Paying
a real cost — no direct pushes, ever — is what separates the claim from the assertion, and the cost
is exactly the evidence.

**Make the repository public but leave CodeQL out**, on the ground that Semgrep already covers SAST.
Rejected because the comment in `ci.yml` named a blocker, not a preference, and a blocker that has
been removed cannot keep standing in for a decision nobody made.

## Reconsideration threshold

Reopen if the repository must go private again — the protection disappears with the plan, and this
ADR would be superseded back to ADR-0040's position with its reasoning intact. Reopen the required
check list itself whenever a job is added, renamed or retired: a required check that no longer
reports blocks every pull request forever, and a job absent from the list is a gate that stopped
being one without anyone deciding.

## Consequences

The README's gate section and `CLAUDE.md`'s claim 1 lose the caveat they have carried since
19/08/2026, and the sentence "a gate that does not block a merge is a warning, not a gate" becomes
true of this repository instead of being the standard it failed.

What it costs is real and should be felt: a one-line fix now takes a branch, a pull request, and a
full CI run. That is the price of the claim, and this ADR is where it is paid rather than argued
about later.
