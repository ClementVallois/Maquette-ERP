/**
 * Which representation a refusal takes: `application/problem+json`, or the same object rendered as
 * a page.
 *
 * **The path decides, and nothing else does.** The obvious alternative is to negotiate on `Accept`,
 * and it loses here: a browser sends `text/html` on every request including the ones to `/api/v1`,
 * so negotiation would make the API's representation depend on who asked rather than on what was
 * asked for — and a `curl` reproducing a screen's bug would get a different answer than the screen
 * did. One rule, readable in one line, with no header in it.
 *
 * It is stated as the JSON prefixes rather than the HTML ones because HTML is the default: a new
 * screen is a screen without doing anything, and a new API route is under `/api/` or it is not an
 * API route.
 */
const JSON_PREFIXES = ['/api/', '/healthz', '/readyz'] as const;

export type Representation = 'json' | 'html';

export function representationOf(url: string): Representation {
  const [path = ''] = url.split('?');

  return JSON_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))
    ? 'json'
    : 'html';
}
