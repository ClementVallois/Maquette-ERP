# ADR-0023 — A persona selector instead of authentication, and where authorization is decided

- **Date**: 2026-08-19
- **Status**: accepted

## Context

The mockup has to demonstrate authorization **by role and by scope**. It has no users, no password
policy, no identity provider, and building one would be the largest thing in the repository while
demonstrating nothing the README claims.

Three facts make this more than a convenience decision.

**The instance is public.** Phase 8 hosts it at `erp.clementvallois.fr`, anyone on the internet can
act as any persona, and the audience is a cybersecurity firm. The two questions such a reader asks
first are not "is there a login" — they can see there is not — but **how the choice persists** and
**what stops another site making it for you**. A selector that answers neither is worse than no
selector, because it invites the conclusion that the rest of the security argument is the same
depth.

**The role half of the authorization claim does not exist yet.** `docs/BUILD-PLAN.md` § 3.3 says
"three roles × `Office` scope"; what Phase 3 shipped is `actor: { officeId }`, with no role type
anywhere in `packages/*/src`. The open question of 19/08/2026 assigned the resolution here, on the
ground that the persona selector is the first thing that produces an actor with a role to carry,
and that inventing a role model before anything could hold one would be guessing its shape.

**`public.consultants.role` already exists and means something else.** The seed writes
`consultant | manager | director` there: that is the firm's HR role, the thing that appears on an
org chart. Reusing it as the authorization role would put two meanings on one column — and one of
the three values, `director`, is not a capability in this chain at all.

## Decision

**A persona selector, announced as such** in the API, in the screens of Phase 6, and in the README.
It is not authentication and is never described as any.

### The personas are seeded data, not a constant in the code

`public.personas` is a reference table with one row per selectable persona, written by the
deterministic seed and by nothing else — the seed is the single writer of reference data
(ADR-0031), and the identifiers it assigns come from a counter, so the API could not hardcode them
even if it wanted to.

**Four entries over three roles**, and the fourth is the point:

| Key                | Role         | Office | Why it exists                                                       |
| ------------------ | ------------ | ------ | ------------------------------------------------------------------- |
| `consultant-paris` | `consultant` | Paris  | Records days, submits a month, sees their own record and no other   |
| `manager-paris`    | `manager`    | Paris  | Validates the office's CRAs, reads its margins                      |
| `manager-lyon`     | `manager`    | Lyon   | **The same role in another office**                                 |
| `billing-paris`    | `billing`    | Paris  | Issues the numbered document, and never validated the days it bills |

`manager-lyon` is not decoration. ADR-0003's demonstration is that a manager in one office cannot
read the margin of a mission in another, and with a single manager persona that can only be shown
by hand-crafting a URL — which reads as a trick. With two, the reader loads the same URL under two
personas and gets 200 and 403. A claim the reader can check without being told how is worth the
one extra row.

`billing-paris` is backed by the one seeded consultant who validates nothing and appears on no
invoice's `validated_by`. That is not an aesthetic choice: `Invoice.issue()` refuses whoever
validated the days it bills (ADR-0006, rule 2), so a billing persona backed by a validator would
make the demonstration's happy path fail.

**The API never reads `public.consultants.role`.** The HR role and the authorization role are two
vocabularies and they stay separate. `Role` — `consultant | manager | billing` — lives in
`@erp/platform`, because both modules' repositories have to speak it and the dependency rule grants
them the kernel and nothing else.

### How the persona persists: a signed cookie, and never a query parameter

`erp_persona=<key>.<base64url HMAC-SHA-256(key)>`, with `HttpOnly`, `SameSite=Strict`, `Path=/`,
and `Secure` whenever the configured public origin is `https`. The signature is compared with
`crypto.timingSafeEqual`, never with `===`.

- **`HttpOnly`** because no script has any business reading it, and the screens of Phase 6 run no
  script at all (ADR-0009).
- **Signed**, so the cookie names a persona this instance offers rather than whatever the client
  typed. Unsigned, the selector would be a client-side assertion of identity — which is precisely
  the thing a reader would expect a security firm's repository not to ship.
- **Never a query parameter.** A URL travels into access logs, `Referer` headers, proxy caches,
  browser history and pasted bug reports. The same reasoning removes query _values_ from the logs
  entirely (ADR-0024), and the two decisions are the same decision seen twice.

### CSRF: `SameSite=Strict` plus an origin check, and no token machinery

Every state-changing method — `POST`, `PUT`, `PATCH`, `DELETE` — requires an `Origin` header equal
to the configured `API_PUBLIC_ORIGIN`. A mismatched origin is refused; **a missing one is refused
too**.

Refusing a missing `Origin` is the part that costs something, and it is deliberate. Browsers send
it on every cross-site state-changing request, so accepting its absence re-opens the hole for any
client that omits it. The cost is that `curl -X POST` needs `-H "Origin: …"`, which `docs/demo.md`
will say out loud.

No CSRF token, no double-submit cookie, no session store. Two independent controls — `SameSite`
and the origin check — cover the browser attack for four personas whose selection is a demo
affordance rather than a credential. The threshold at which that stops being enough is below.

### Where authorization is decided: three loci, and no duplication

`BUILD-RULES.md` says authorization is "never in a controller and never duplicated: one rule, one
source". Applying it needs the observation that "authorization" is three different questions, and
each has exactly one home:

| Question                                             | Home           | Established by |
| ---------------------------------------------------- | -------------- | -------------- |
| **Which records may this actor see?**                | the repository | ADR-0003       |
| **May this actor act, given who acted before them?** | the domain     | ADR-0006       |
| **Does this actor's role carry this action at all?** | the route      | here           |

The third is not a duplicate of the first two, and nothing else can express it. A repository is a
data filter: it cannot say "a consultant may not attempt an issuance". The domain holds separation
of duties — `Cra.validate()` refuses a non-manager and a self-validator, `Invoice.issue()` refuses
the validator — but it holds them about **identity**, not about role, and it must not learn what an
HTTP role is.

So each route **declares** the role it requires, in one table, and a route registered without a
declaration fails to register. That declaration is the single source: it is data, it is greppable,
and a test asserts every route has one. Scattering `if (role !== 'manager')` through handlers is
what the rule forbids, and it is not what this is.

The **data scope** rule in the repositories gains the role dimension it was missing:

| Role         | CRAs                | Invoices     | `Tjm`, `Cjm`, margin |
| ------------ | ------------------- | ------------ | -------------------- |
| `consultant` | **their own only**  | none         | none                 |
| `manager`    | their office        | their office | their office         |
| `billing`    | their office (read) | their office | none                 |

`billing` reads CRAs and does not read margins: the CRA is the source document behind the invoice
line — that is the _piste d'audit fiable_ this repository claims — while the cost of the consultant
who produced it is not a billing input.

## Rejected option

**A real OIDC provider** (Auth0, Keycloak, Dex). The honest option, and the one a production system
takes. It loses three ways here. It makes the demonstration _invisible_: the reader has to be given
four sets of credentials and log out between them, when the property being demonstrated is a
two-click comparison. It puts a redirect flow, a token library, a JWKS cache and a clock-skew
policy into a repository whose thesis is that its boundary is enforced by CI. And on a public demo
instance it would need real accounts to be worth anything, which is a user directory this mockup
explicitly does not build. **Threshold**: the first real user, or any data that is not synthetic.

**An unsigned cookie, or a query parameter.** Both are one line shorter. Both make the persona a
client-supplied string, which turns the selector from "choose which of four demo identities to act
as" into "assert who you are". Nothing downstream would know the difference, which is exactly the
failure: every authorization test in the repository would still pass.

**`@fastify/cookie`.** A well-maintained plugin that does signing, and the obvious dependency. It
loses on the same grounds as the hand-written UUIDv7 (ADR-0041) and the template engine ADR-0025
rejects: what is needed is `createHmac`, `timingSafeEqual` and one `Set-Cookie` string, and the
plugin brings a cookie parser, a signing rotation scheme and a serialiser for options this
application does not set. **Threshold**: a second cookie, or a signing-key rotation requirement —
at which point the rotation logic is the part worth not writing.

**A CSRF token.** Stronger in general, and the correct answer for a form-heavy application with
sessions. Here it means a token store, a per-form hidden field and an invalidation policy, to
protect a selector that carries no privilege a visitor does not already have — anyone can select
any persona. **Threshold**: the day a persona is not freely selectable, which is the same day
authentication exists.

**Overloading `public.consultants.role`.** No migration, no table, no seed row. It conflates the
HR role with the authorization role and forces `director` to mean `billing`, which is a mapping
nobody would recover from reading the code. `CONTEXT.md` exists to stop exactly this.

## Reconsideration threshold

The whole decision is reopened by **one real user**. Everything above rests on every identity being
synthetic and every persona being freely selectable; the moment either stops being true, the
selector is a vulnerability rather than a demonstration, and ADR-0032's "resettable demo" is
reopened at the same time.

The CSRF stance is reopened sooner, by the first **privileged** persona — one a visitor may not
select. At that point `SameSite` plus an origin check protects a real privilege, and a token becomes
proportionate.

The role model is reopened by the fourth role, or by the first role that is not a pure superset
question — a role scoped to a `Practice` rather than an `Office`, for instance, which the current
`Actor` shape cannot express.

## Consequences

The role half of the authorization claim exists, and the README can stop saying which half is
missing. Both repositories' reads take a role, and the refusal is testable in both directions for
each of the three.

Beat two of ADR-0003 — "a direct API call refused with a 403 that names the rule that denied it" —
becomes demonstrable, and demonstrable _by switching persona_ rather than by crafting a URL.

The costs, stated rather than found later:

- **Four personas share one browser.** Selecting a persona in one tab changes it in all of them,
  because the cookie is per-origin. Comparing two personas side by side needs two browser profiles
  or a private window, and `docs/demo.md` will say so.
- **`Origin` is required on writes**, so a `curl` example without it gets a 403 and looks like a
  bug. It is documented at the point where someone would hit it.
- **The persona table is reference data**, which means adding a persona is a seed change and a
  reset, not a configuration flag. That is the price of ADR-0031's single-writer rule, taken
  knowingly.
