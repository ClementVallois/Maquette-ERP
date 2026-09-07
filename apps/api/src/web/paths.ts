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
  /** The SPA entry point and persona selector. */
  home: '/',
  /**
   * The SPA's `/cra` and `/cra/$period` prefix. Printables link back to it, while the SPA fallback
   * owns the route registration.
   */
  spaCra: '/cra',
  /**
   * The SPA's pré-facturier route. Fastify reaches it through the SPA fallback.
   */
  preFacturier: '/pre-facturier',
  /** One invoice, draft or issued, as the printable document of ADR-0055. */
  invoice: '/facture',
  /** One Cra as the printable record of ADR-0056. An id appended to it names the month. */
  craPrint: '/releve',
} as const;
