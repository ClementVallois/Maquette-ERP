import type { LinkProps } from '@tanstack/react-router';

/**
 * A labelled destination: the one button a feedback state (`EmptyState`, `ErrorState`) or a
 * dashboard call to action carries.
 *
 * It is `LinkProps` and not `{ to: string }` on purpose. TanStack Router's `to` is a **pathname
 * template only** — `buildLocation` (`@tanstack/router-core`) resolves it through
 * `resolvePathWithBase`/`interpolatePath` and then sets `nextSearch = fromSearch` — so a query
 * string written into a widened `string` `to` is never parsed into search params: it becomes part
 * of the pathname, matches no route, and lands on the not-found branch. Typed this way, `to`
 * narrows to the registered route templates, a search param has to travel in `search`, and a
 * route param in `params`. `features/dashboard/actions.ts` records the one time the widened form
 * shipped a broken link.
 */
export type ActionLink = { readonly label: string } & LinkProps;

/** The same descriptor with the label split off — exactly the props `<Link>` takes. */
export function linkOf({ label: _label, ...link }: ActionLink): LinkProps {
  return link;
}
