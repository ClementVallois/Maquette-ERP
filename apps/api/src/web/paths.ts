/**
 * Every URL the screens link to or register, in one place.
 *
 * It exists because a link and the route it points at are two statements of the same fact, and the
 * one that rots is always the link. The route registrations below read from here too, so a typo is
 * a page that does not exist rather than a page that 404s from one direction only.
 *
 * **The paths are French**, unlike `/api/v1`, and ADR-0026 says why: a URL is read aloud in a demo
 * and pasted into a message, so it is part of the screen and takes the screen's language. The API
 * is a code interface and takes the code's.
 */
export const PATHS = {
  /**
   * The entry point a cold reader lands on. No route registers a GET here since front-end plan
   * Phase 9.3 — the SPA fallback (`server.ts`) serves it, and the SPA is itself the persona
   * selector now.
   */
  home: '/',
  choosePersona: '/persona',
  clearPersona: '/persona/retrait',
  /**
   * The consultant's own months, as a **registered route** — the POST that saves and submits a
   * month still lives here (Phase 9.3 kept the action verb, only the two GET screens that used to
   * render at this prefix and `${this}/:period` are gone). Not where the grid is read any more:
   * `spaCra` below is.
   */
  consultantCra: '/consultant/cra',
  /**
   * The SPA's own `/cra` and `/cra/$period` (front-end plan §3, "Routes SPA épinglées") — never
   * registered by this file, reached only through the SPA fallback (Phase 9.1). Named here anyway,
   * the way every other link in this table is: the two printables link back to it, and a link and
   * the route it points at are still two statements of the same fact even when this repository
   * does not register the second one.
   */
  spaCra: '/cra',
  /**
   * The pré-facturier's two write verbs still register at this prefix (Phase 9.3 kept them); the
   * SPA itself now renders `GET /pre-facturier` (the same literal path, `?period=YYYY-MM` —
   * English, the SPA's own search param, not this file's `periode` form field) through the SPA
   * fallback, so no `spa`-prefixed alias is needed the way `spaCra` is.
   */
  preFacturier: '/pre-facturier',
  /** One invoice, draft or issued, as the printable document of ADR-0055. */
  invoice: '/facture',
  /** One Cra as the printable record of ADR-0056. An id appended to it names the month. */
  craPrint: '/releve',
  /** The manager's two answers to a submitted month. A Cra id is appended to each. */
  validateCra: '/pre-facturier/validation',
  refuseCra: '/pre-facturier/refus',
  /** Billing's one write: an invoice id appended to it is issued (ADR-0059). */
  issueInvoice: '/facture/emission',
} as const;
