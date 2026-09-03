# ADR-0040 — The CI gates are advisory while the repository is private on the free plan

- **Date**: 2026-08-19
- **Status**: superseded by ADR-0086

## Context

The first claim this mockup makes is a module boundary **enforced by CI**. The README sharpens it
into a rule — _une porte qui ne bloque pas un merge est un avertissement, pas une porte_: **a gate
that does not block a merge is a warning, not a gate** — and `docs/BUILD-PLAN.md` § 0.5 states the
same sentence in English. Task 0.5 acted on it, documented five required checks in the README, and
named "enabling branch protection in the GitHub UI" as a human step still outstanding.

(`CLAUDE.md` § 1 makes the neighbouring but **different** claim, "breaking the boundary must fail
the CI, not produce a warning", which is about a rule's _severity_ and is unaffected by this ADR.
The two senses of "warning" are disentangled in the README's gate section; conflating them is what
made this ADR look, at first, like it demolished the headline.)

Opening the repository's first pull request on 19/08/2026 showed that the step is not outstanding.
It is **unavailable**:

```
GET /repos/ClementVallois/Maquette-ERP/branches/main/protection
→ 403  "Upgrade to GitHub Pro or make this repository public to enable this feature."
```

Branch protection — the only mechanism that can disable the merge button — needs a paid plan or a
public repository. This one is private on the free plan. PR #1 merged with eight green jobs and
nothing that could have stopped it had they been red.

So the README's sentence "**cinq sont exigées** par la protection de branche sur `main`" was false,
and had been false since it was written. By the repository's own definition, all eight of its gates
are warnings.

## Decision

The repository stays **private on the free plan** for now, and the README says plainly that the
eight CI jobs are **advisory**: they run on every push and every pull request, they go red, and the
rule that nothing merges red is held by the author rather than by the platform.

The claim is narrowed, not deleted, and not quietly footnoted. "Enforced by CI" continues to mean
what it can honestly mean here — **the job fails** — which is also the thing the live demo shows.

## Rejected option

**Buying GitHub Pro, or making the repository public now, to make the original sentence true.**

Pro is a recurring cost for one tick-box on a mockup, and it buys nothing else this build uses.
Going public is not a billing decision but a **disclosure** one: the history, the ADRs and the open
questions were written for a reader who receives the link deliberately, and that call belongs to
Phase 9 — it is already an open question of 18/08/2026, and pre-empting it to close a documentation
gap would be deciding the larger thing for the smaller reason.

**Deleting the sentence** — «cinq sont exigées par la protection de branche», _five are required by
branch protection_ — was the third option and the worst. It is the sentence that makes the thesis
checkable; without it a reader cannot tell whether the gates block anything, and the repo would be
quieter rather than more honest.

## Reconsideration threshold

**The day the repository becomes public** — the disclosure decision recorded as an open question on
18/08/2026 in `docs/open-questions.md`, and scheduled as **task 9.2 bis** of `docs/BUILD-PLAN.md`,
before the link goes out. (Not task 9.2, which is the cold reader's five-line path and decides
nothing about publication.) Branch protection is free on a public repository, so ticking the eight
required checks costs nothing then, and a superseding ADR records it.

Reopened earlier if **a second person gains write access**. "Nothing merges red" is one person's
discipline; it stops being a credible control the moment it is more than one person's, and at that
point the paid plan becomes worth its price.

## Consequences

**Easy.** Nothing to buy, no disclosure decision forced early by a side concern, and the repository
states what is true. The demo is untouched: breaking the boundary live still turns the CI red,
which is what is being shown.

**Expensive.** The strongest form of the claim is not available, and a reviewer who checks will find
eight green advisory jobs. A private repository also has **no visible Actions tab and no status
badge** for whoever holds the link, so "the eight are green" is the one statement in that README
section a reader is asked to take on trust — against a README whose stated ethos is _pour vérifier
soi-même plutôt que me croire_, _to check for yourself rather than believe me_. Going public buys
the badge in the same act as the protection. It also means the local `lefthook` hooks are doing more of the real work
than the pipeline is — and they are opt-in (`ignore-scripts` is on, so a fresh clone has none until
`pnpm exec lefthook install`), which the README already says.

This is the **third** plan-tier limit this build has hit, and the first with no workaround: CodeQL
code scanning and SARIF upload both need GitHub Advanced Security on a private repository, and
`ci.yml` already answers both by running Semgrep OSS and osv-scanner as pinned containers instead.
There is no equivalent substitute for branch protection; there is only saying so.
