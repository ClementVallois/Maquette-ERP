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
  /** The persona selector, and the entry point a cold reader lands on. */
  home: '/',
  choosePersona: '/persona',
  clearPersona: '/persona/retrait',
  /** The consultant's own months. A period appended to it is one month's grid. */
  consultantCra: '/consultant/cra',
} as const;
