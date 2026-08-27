import type { FastifyInstance, FastifyReply } from 'fastify';

import { LABELS } from './labels.ts';
import { html, type Html, renderToString } from './render/html.ts';

export const HTML = 'text/html; charset=utf-8';

const OK = 200;
const SEE_OTHER = 303;

/**
 * The Content-Security-Policy this application can honestly claim.
 *
 * It is worth having as a header even though BUILD-PLAN 8.3 puts security headers on the nginx
 * vhost, and the reason is not defence in depth. It is that **this policy is a statement about the
 * code**, not about the deployment. A policy that lived only in the reverse proxy would be absent
 * in development, absent in the tests, and true by accident.
 *
 * `form-action 'self'` is the one that matters most in a mockup whose every write is a form post:
 * it means an injected `<form action="https://…">` cannot exfiltrate a submission even if the
 * escaping of ADR-0025 were defeated.
 *
 * The exact string is frozen in ADR-0064 (front-end plan Phase 9.2): `script-src 'self'` is the
 * SPA's own self-hosted bundle and nothing else, `font-src 'self'` is Phase 2.2's self-hosted
 * interface font, `connect-src 'self'` is the SPA's own `fetch` calls to `/api/v1` — all three new
 * relative to ADR-0049's six. Changing any clause here without changing ADR-0064 in the same
 * commit is the drift that ADR itself was written to prevent.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Applied to every response, JSON included. A `Content-Security-Policy` on a JSON body does
 * nothing and costs nothing; a header list with an exception in it is a header list someone has to
 * remember, which is the failure mode this whole repository is arranged against.
 */
export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', (_request, reply, payload, done) => {
    void reply.headers({
      'content-security-policy': CONTENT_SECURITY_POLICY,
      // The renderer of ADR-0025 sets a content type on everything it sends; this is what stops a
      // browser from deciding it knows better and sniffing a response into a script.
      'x-content-type-options': 'nosniff',
      // No `Referer` leaves this instance. A Cra URL carries a consultant id and a period, and a
      // referrer is the classic way an internal identifier reaches a third party's log.
      //
      // `same-origin` and NOT `no-referrer`, which is the value ADR-0049 named and which silently
      // breaks every write in these screens. Fetch derives a form post's `Origin` from the
      // referrer policy: under `no-referrer` the browser appends the literal string `null` — on a
      // **same-origin** submission too — and `registerOriginCheck` then refuses its own forms. No
      // test caught it because `app.inject()` sets `Origin` by hand, as do the README's `curl`
      // examples. `same-origin` nulls the origin only when the request really is cross-origin, so
      // the CSRF control is unchanged and no referrer still leaves this instance.
      'referrer-policy': 'same-origin',
      'x-frame-options': 'DENY',
    });
    done(null, payload);
  });
}

export function sendPage(reply: FastifyReply, page: Html, status: number = OK): FastifyReply {
  return reply.code(status).type(HTML).send(renderToString(page));
}

/**
 * POST-then-redirect. Every write in these screens is a form submission, and answering one with a
 * page means the browser re-submits it on refresh — a second validation, a second issuance. 303
 * (rather than 302) is what makes the follow-up request a GET on every client, which is the whole
 * point of using it here.
 *
 * The location is always a path this application owns: it comes from `PATHS`, never from a query
 * parameter or a `Referer`, so there is no open redirect to close.
 */
export function redirectTo(reply: FastifyReply, path: string): FastifyReply {
  return reply
    .code(SEE_OTHER)
    .header('location', path)
    .type(HTML)
    .send(renderToString(html`<p><a href="${path}">${LABELS.action.continue}</a></p>`));
}
