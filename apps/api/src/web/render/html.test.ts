import { describe, expect, it } from 'vitest';

import { Html, html, renderToString, trustedMarkup, UnsafeMarkupError } from './html.ts';

/**
 * The security-relevant test file of Phase 6. BUILD-PLAN 6.1 asks to be **generous rather than
 * minimal** here, and names the four contexts: text, attribute (quoted and unquoted), URL, and
 * the opt-out.
 *
 * Every case below is a negative one except where it says otherwise: what matters is not that the
 * renderer produces markup, it is that it **refuses** the markup it cannot make safe. A renderer
 * that escapes text and quietly interpolates into `<script>` is worse than no renderer, because it
 * looks like a control.
 */

const XSS = '<script>alert(1)</script>';

describe('text context', () => {
  it('escapes the five characters that change the meaning of markup', () => {
    expect(renderToString(html`<p>${`&<>"'`}</p>`)).toBe('<p>&amp;&lt;&gt;&quot;&#39;</p>');
  });

  it('renders an injected tag as text, not as a tag', () => {
    const rendered = renderToString(html`<p>${XSS}</p>`);

    expect(rendered).not.toContain('<script>');
    expect(rendered).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });

  it('escapes the same way at the very start and the very end of a template', () => {
    expect(renderToString(html`${'<b>'}`)).toBe('&lt;b&gt;');
    expect(renderToString(html`<p>${'a'}</p>${'<b>'}`)).toBe('<p>a</p>&lt;b&gt;');
  });

  it('nests a template without re-escaping it', () => {
    const row = html`<td>${'a & b'}</td>`;

    expect(renderToString(html`<tr>${row}</tr>`)).toBe('<tr><td>a &amp; b</td></tr>');
  });

  it('joins an array of templates with nothing between them', () => {
    const rows = ['x', 'y'].map((cell) => html`<td>${cell}</td>`);

    expect(renderToString(html`<tr>${rows}</tr>`)).toBe('<tr><td>x</td><td>y</td></tr>');
  });

  it('renders nothing for the values a conditional produces when it is false', () => {
    expect(renderToString(html`<p>${null}${undefined}${false}</p>`)).toBe('<p></p>');
  });

  it('renders a number, because a total is a number', () => {
    expect(renderToString(html`<td>${1234}</td>`)).toBe('<td>1234</td>');
  });

  it('refuses a value that has no defensible rendering', () => {
    expect(() => html`<p>${{ total: 1 }}</p>`).toThrow(UnsafeMarkupError);
    expect(() => html`<p>${true}</p>`).toThrow(UnsafeMarkupError);
    expect(() => html`<p>${Symbol('x')}</p>`).toThrow(UnsafeMarkupError);
  });
});

describe('quoted attribute context', () => {
  it('escapes the quote that would end the attribute', () => {
    const rendered = renderToString(html`<td title="${'a" onmouseover="alert(1)'}">x</td>`);

    expect(rendered).toBe('<td title="a&quot; onmouseover=&quot;alert(1)">x</td>');
  });

  it('escapes inside a single-quoted attribute too', () => {
    expect(renderToString(html`<td title='${"a' x"}'>y</td>`)).toBe("<td title='a&#39; x'>y</td>");
  });

  it('keeps parsing correctly after an attribute hole', () => {
    const rendered = renderToString(html`<td class="${'a'}" title="${'b'}">${'c'}</td>`);

    expect(rendered).toBe('<td class="a" title="b">c</td>');
  });

  it('parses an attribute with no value between two holes', () => {
    const rendered = renderToString(html`<input class="${'a'}" disabled value="${'b'}" />`);

    expect(rendered).toBe('<input class="a" disabled value="b" />');
  });
});

describe('unquoted attribute context', () => {
  /**
   * Escaping cannot save this one: `&<>"'` are all escaped and a space still ends the value, so
   * `x onclick=alert(1)` becomes an event handler with no character the escaper touches. The
   * renderer refuses the hole instead of pretending to have handled it.
   */
  it('refuses a hole in an unquoted attribute value', () => {
    expect(() => html`<a href=${'/x'}>y</a>`).toThrow(UnsafeMarkupError);
  });

  it('names the position in the refusal, so the author can find it', () => {
    expect(() => html`<a href=${'/x'}>y</a>`).toThrow(/unquoted attribute/iu);
  });

  it('refuses a hole in an attribute name', () => {
    expect(() => html`<a ${'href'}="/x">y</a>`).toThrow(UnsafeMarkupError);
  });

  it('refuses a hole in a tag name', () => {
    expect(() => html`<${'div'}>x</div>`).toThrow(UnsafeMarkupError);
  });
});

describe('URL context', () => {
  it('allows a relative URL, which is every link this application has', () => {
    expect(renderToString(html`<a href="${'/cras/42?period=2026-06'}">x</a>`)).toBe(
      '<a href="/cras/42?period=2026-06">x</a>',
    );
  });

  it('allows http, https and mailto', () => {
    expect(renderToString(html`<a href="${'https://example.test/a'}">x</a>`)).toContain('https://');
    expect(renderToString(html`<a href="${'mailto:a@example.test'}">x</a>`)).toContain('mailto:');
  });

  it('refuses javascript:', () => {
    expect(() => html`<a href="${'javascript:alert(1)'}">x</a>`).toThrow(UnsafeMarkupError);
  });

  it('refuses javascript: however it is spelled', () => {
    // Browsers strip ASCII whitespace and C0 controls while resolving a scheme, so every one of
    // these navigates. A sanitiser that tests the raw string passes all four through.
    for (const attempt of [
      'JaVaScRiPt:alert(1)',
      'java\tscript:alert(1)',
      'java\nscript:alert(1)',
      ' \u0000javascript:alert(1)',
    ]) {
      expect(() => html`<a href="${attempt}">x</a>`).toThrow(UnsafeMarkupError);
    }
  });

  it('refuses data:, which carries its own document', () => {
    expect(() => html`<a href="${'data:text/html,<script>alert(1)</script>'}">x</a>`).toThrow(
      UnsafeMarkupError,
    );
  });

  it('refuses a protocol-relative URL: nothing here links off this origin', () => {
    expect(() => html`<a href="${'//evil.test/x'}">x</a>`).toThrow(UnsafeMarkupError);
  });

  it('applies the scheme allowlist to every URL-bearing attribute, not only href', () => {
    for (const attribute of ['src', 'action', 'formaction', 'poster', 'cite']) {
      const template = [`<x ${attribute}="`, '">y</x>'] as unknown as TemplateStringsArray;

      expect(() => html(template, 'javascript:alert(1)')).toThrow(UnsafeMarkupError);
    }
  });

  it('still escapes a URL it allows', () => {
    expect(renderToString(html`<a href="${'/a?b=1&c=2'}">x</a>`)).toBe(
      '<a href="/a?b=1&amp;c=2">x</a>',
    );
  });
});

describe('script, style and event-handler contexts', () => {
  it('refuses a hole inside a script body', () => {
    expect(() => html`<script>const x = ${'1'};</script>`).toThrow(UnsafeMarkupError);
  });

  it('refuses a hole inside a style body', () => {
    expect(() => html`<style>.a { color: ${'red'} }</style>`).toThrow(UnsafeMarkupError);
  });

  it('refuses a hole in any on* attribute, even quoted', () => {
    expect(() => html`<button onclick="${'go()'}">x</button>`).toThrow(UnsafeMarkupError);
    expect(() => html`<button ONCLICK="${'go()'}">x</button>`).toThrow(UnsafeMarkupError);
  });

  it('refuses a hole in a style attribute', () => {
    expect(() => html`<div style="${'width:1px'}">x</div>`).toThrow(UnsafeMarkupError);
  });

  it('allows a hole in title and textarea, where escaping is sufficient', () => {
    // RCDATA, not RAWTEXT: a browser decodes character references there and does not open tags,
    // so `&lt;` renders as a literal `<` and nothing executes.
    expect(renderToString(html`<title>${'a & <b>'}</title>`)).toBe(
      '<title>a &amp; &lt;b&gt;</title>',
    );
    expect(renderToString(html`<textarea>${XSS}</textarea>`)).not.toContain('<script>');
  });

  it('resumes normal parsing after a script element closes', () => {
    expect(renderToString(html`<script>var a = 1;</script><p>${XSS}</p>`)).toContain(
      '&lt;script&gt;',
    );
  });
});

describe('comments and doctypes', () => {
  it('refuses a hole inside a comment', () => {
    expect(() => html`<!-- ${'x'} -->`).toThrow(UnsafeMarkupError);
  });

  it('does not mistake a doctype for an unterminated comment', () => {
    // `<!DOCTYPE html>` starts with `<!` and never contains `-->`. Treating it as a comment would
    // put every hole in the rest of the document into "comment" context and refuse the page.
    expect(renderToString(html`<!doctype html><p>${'x'}</p>`)).toBe('<!doctype html><p>x</p>');
  });

  it('resumes normal parsing after a comment closes', () => {
    expect(renderToString(html`<!-- a --><p>${'<b>'}</p>`)).toBe('<!-- a --><p>&lt;b&gt;</p>');
  });
});

describe('the opt-out', () => {
  it('is the only route to raw markup', () => {
    expect(renderToString(html`<p>${trustedMarkup('<b>x</b>', 'a test fixture')}</p>`)).toBe(
      '<p><b>x</b></p>',
    );
  });

  it('demands a reason, so an unexplained one cannot be written', () => {
    expect(() => trustedMarkup('<b>x</b>', '')).toThrow(UnsafeMarkupError);
    expect(() => trustedMarkup('<b>x</b>', '  ')).toThrow(UnsafeMarkupError);
  });

  it('cannot be reached by handing the renderer an object that looks like one', () => {
    const forgery = { value: '<script>alert(1)</script>', toString: () => '<script>x</script>' };

    expect(() => html`<p>${forgery}</p>`).toThrow(UnsafeMarkupError);
  });

  it('does not launder an unsafe URL, because an attribute refuses markup outright', () => {
    expect(() => html`<a href="${trustedMarkup('javascript:x', 'why')}">y</a>`).toThrow(
      UnsafeMarkupError,
    );
  });
});

/**
 * The scanner only ever reads the static chunks that **precede** a hole — there is nothing to
 * decide about markup that follows the last one. So every case here puts the hole *after* the
 * construct being exercised, which is also the only way these transitions get executed at all:
 * a first draft of this file tested `<input … />` with the `/>` in the trailing chunk, and the
 * self-closing branch was never entered.
 */
describe('the scanner tracks state through the markup this repository actually writes', () => {
  const textAfter = (template: Html): string => renderToString(template);

  it('returns to text after a self-closing tag', () => {
    expect(textAfter(html`<br />${'<b>'}`)).toBe('<br />&lt;b&gt;');
    expect(textAfter(html`<br/>${'<b>'}`)).toBe('<br/>&lt;b&gt;');
  });

  it('returns to text after a tag with valueless attributes', () => {
    expect(textAfter(html`<input disabled>${'<b>'}`)).toBe('<input disabled>&lt;b&gt;');
    expect(textAfter(html`<input disabled />${'<b>'}`)).toBe('<input disabled />&lt;b&gt;');
    expect(textAfter(html`<input disabled/>${'<b>'}`)).toBe('<input disabled/>&lt;b&gt;');
  });

  it('returns to text after an unquoted attribute value it did not have to fill', () => {
    // The value is static, so there is no hole to refuse — but the scanner still has to come out
    // of `attrValueUnquoted` in the right mode, or the following hole is misjudged.
    expect(textAfter(html`<td colspan=2>${'<b>'}</td>`)).toBe('<td colspan=2>&lt;b&gt;</td>');
    expect(textAfter(html`<td colspan=2 class="a">${'<b>'}</td>`)).toBe(
      '<td colspan=2 class="a">&lt;b&gt;</td>',
    );
  });

  it('parses an attribute whose = is separated from its name by spaces', () => {
    expect(textAfter(html`<td class = "a">${'<b>'}</td>`)).toBe('<td class = "a">&lt;b&gt;</td>');
    expect(textAfter(html`<td class = >${'<b>'}</td>`)).toBe('<td class = >&lt;b&gt;</td>');
  });

  it('parses two quoted attributes with no space between them', () => {
    expect(textAfter(html`<td class="a"title="b">${'<b>'}</td>`)).toBe(
      '<td class="a"title="b">&lt;b&gt;</td>',
    );
    expect(textAfter(html`<td class="a"/>${'<b>'}`)).toBe('<td class="a"/>&lt;b&gt;');
  });

  it('treats a < that opens nothing as literal text', () => {
    expect(textAfter(html`a < b ${'<c>'}`)).toBe('a < b &lt;c&gt;');
  });

  it('reads a closing tag without mistaking it for an opening one', () => {
    expect(textAfter(html`<div></div>${'<b>'}`)).toBe('<div></div>&lt;b&gt;');
  });

  it('survives the sloppy spacing a browser tolerates', () => {
    // None of these is markup anyone would write on purpose. They are here because the scanner
    // must be right about markup it does not expect, or its refusals are decided by luck.
    expect(textAfter(html`<div  >${'<b>'}</div>`)).toBe('<div  >&lt;b&gt;</div>');
    expect(textAfter(html`<div class  >${'<b>'}</div>`)).toBe('<div class  >&lt;b&gt;</div>');
    expect(textAfter(html`<div /class="a">${'<b>'}</div>`)).toBe('<div /class="a">&lt;b&gt;</div>');
  });

  it('refuses a hole in srcset rather than sanitising the first URL of a list', () => {
    expect(() => html`<img srcset="${'a.png 1x, javascript:alert(1) 2x'}" />`).toThrow(
      UnsafeMarkupError,
    );
  });
});

/**
 * Package 13 of the cleanup audit: `Html.of` was a public static member, callable from any file
 * in the repository, that constructed raw unescaped markup with no reason argument — bypassing
 * `trustedMarkup`'s own gate entirely. `Html.read` had the matching problem in the other
 * direction. Both are `private static` now (`html.ts`'s own header comment on the class explains
 * why that requires `render`/`tag` to be static methods too, not merely renamed free functions).
 *
 * There is no runtime behavior to assert here — the fix is a compiler boundary, not a code path —
 * so the assertion is the compiler itself: `@ts-expect-error` makes `pnpm run -s typecheck` fail
 * if the line below *doesn't* produce a type error, which is exactly the state before this
 * package's fix (`Html.of` was callable, so this comment would have reported "unused
 * '@ts-expect-error' directive" and failed the same gate for the opposite reason). Verified both
 * ways: this block was added while `of`/`read` were still public, and `pnpm run -s typecheck`
 * failed on it (an unused directive) until the class was changed to make it fail for the reason
 * this comment names instead.
 */
describe('package 13: Html cannot be constructed or read from outside this module', () => {
  it('has no runtime assertion — see the block comment above this describe', () => {
    // @ts-expect-error — `of` is private static; only Html's own static methods may call it.
    Html.of('<script>evil</script>');
    // @ts-expect-error — `read` is private static; only Html's own static methods may call it.
    Html.read(html`safe`);

    expect(true).toBe(true);
  });
});
