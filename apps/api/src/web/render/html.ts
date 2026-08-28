import { TechnicalFailure } from '@erp/platform';

/**
 * HTML with no template engine (ADR-0025): a tagged template that escapes by default and
 * **refuses** every hole it cannot make safe.
 *
 * The part that is not obvious, and is the whole point: escaping is not one operation. `&lt;` is
 * right in text and in a quoted attribute, useless in an unquoted one (a space ends the value),
 * and actively wrong inside `<script>` (the browser never decodes it there). A renderer with one
 * escaper is safe in the context its author had in mind and silently unsafe in the other three.
 *
 * So this one **parses the static halves of the template** — the parts the author wrote, never the
 * interpolated data — and knows, for every hole, which context it lands in. Three outcomes:
 * escape, sanitise then escape (a URL-bearing attribute), or throw. There is no fourth.
 */

/** A refusal to render. Technical, not business: no rule of the domain was consulted. */
export class UnsafeMarkupError extends TechnicalFailure {
  readonly retryable = false;
}

/**
 * Markup that has been through this module. The field is `#private`, so an object shaped like one
 * is not one — `instanceof` is a real check here, and `html` refuses anything that fails it rather
 * than calling `toString()` on it.
 */
export class Html {
  readonly #markup: string;

  /** Private: `html` and `trustedMarkup` are the only two ways to obtain one. */
  private constructor(markup: string) {
    this.#markup = markup;
  }

  /** @internal — construction stays inside this module; see the two factories below. */
  static of(markup: string): Html {
    return new Html(markup);
  }

  /** @internal */
  static read(node: Html): string {
    return node.#markup;
  }
}

export function renderToString(node: Html): string {
  return Html.read(node);
}

/**
 * The named opt-out, and the only route to raw markup. It demands a reason in the call itself, so
 * `grep -rn 'trustedMarkup(' apps/` enumerates every place raw markup enters a page **with the
 * argument for it on the same line**. A comment above the call would rot; an argument cannot.
 */
export function trustedMarkup(rawMarkup: string, why: string): Html {
  if (why.trim() === '') {
    throw new UnsafeMarkupError(
      'trustedMarkup needs a reason: it is the one route past escaping, and an unexplained one ' +
        'is indistinguishable from a mistake.',
    );
  }

  return Html.of(rawMarkup);
}

// ── Escaping ────────────────────────────────────────────────────────────────

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escape(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ESCAPES[character] ?? character);
}

// ── URL sanitising ──────────────────────────────────────────────────────────

const SAFE_SCHEMES = new Set(['http', 'https', 'mailto']);
const SCHEME = /^([a-z][a-z0-9+.-]*):/iu;

/**
 * Attributes whose value a browser fetches or navigates to. `srcset` is deliberately **absent**:
 * it is a comma-separated list with descriptors, and a sanitiser written for one URL would pass a
 * second one through untouched. A hole there is refused instead.
 */
const URL_ATTRIBUTES = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'poster',
  'cite',
  'data',
  'ping',
  'background',
  'xlink:href',
]);

/**
 * A scheme is resolved by the browser **after** it discards ASCII whitespace and C0 controls, so
 * `java\tscript:` navigates and `javascript:` written with a leading newline navigates. Testing
 * the raw string is the classic hole; the scheme is read off a stripped copy and the original is
 * what gets escaped and emitted.
 */
function sanitiseUrl(url: string, attribute: string): string {
  // Written as a filter rather than a regular expression on purpose: the character class this
  // needs is exactly the one `no-control-regex` exists to flag, and silencing that rule here
  // would silence it for whatever gets written next to it.
  const bare = Array.from(url, (character) =>
    (character.codePointAt(0) ?? 0) > 0x20 ? character : '',
  ).join('');

  // `//host/path` inherits the current scheme and leaves this origin. Nothing in this application
  // links off-site except `mailto:`, so it is refused rather than allowed and audited later.
  if (bare.startsWith('//')) {
    throw new UnsafeMarkupError(
      `${attribute} was given a protocol-relative URL (${truncate(url)}). Use a path, or an ` +
        'absolute http(s) URL.',
    );
  }

  const scheme = SCHEME.exec(bare)?.[1]?.toLowerCase();
  if (scheme === undefined) return url; // No scheme: a path, a query or a fragment.

  if (!SAFE_SCHEMES.has(scheme)) {
    throw new UnsafeMarkupError(
      `${attribute} was given a "${scheme}:" URL (${truncate(url)}). Only http, https and mailto ` +
        'reach an attribute; everything else is refused.',
    );
  }

  return url;
}

const MAX_QUOTED = 60;

function truncate(value: string): string {
  return value.length <= MAX_QUOTED ? value : `${value.slice(0, MAX_QUOTED)}…`;
}

// ── The scanner ─────────────────────────────────────────────────────────────

/**
 * A deliberately small subset of the HTML tokenizer: enough to know, at the end of each static
 * chunk, whether the next hole is in text, in a quoted attribute value, or somewhere a value must
 * not go. Anything it does not recognise resolves to a refusal, which is the safe direction — a
 * misparse costs a page that does not render, never a page that executes.
 */
type Mode =
  | 'text'
  | 'tagOpen'
  | 'tagName'
  | 'beforeAttrName'
  | 'attrName'
  | 'afterAttrName'
  | 'beforeAttrValue'
  | 'attrValueQuoted'
  | 'attrValueUnquoted'
  | 'afterAttrValueQuoted'
  | 'selfClosing'
  | 'markupDeclaration'
  | 'comment'
  | 'bogusComment'
  | 'rawText';

/** `<script>`/`<style>` are RAWTEXT: a browser decodes nothing there, so escaping is a no-op. */
const RAW_TEXT_TAGS = new Set(['script', 'style']);
/** `<title>`/`<textarea>` are RCDATA: character references *are* decoded, so escaping works. */
const RCDATA_TAGS = new Set(['title', 'textarea']);

const WHITESPACE = new Set([' ', '\t', '\n', '\r', '\f']);
const ASCII_ALPHA = /^[a-z]$/iu;

type Context =
  { kind: 'text' } | { kind: 'attribute'; name: string } | { kind: 'refused'; why: string };

/**
 * One scan per template. A class rather than a function over a state record for a mechanical
 * reason: the transitions mutate the state on nearly every character, and `no-param-reassign`
 * forbids doing that to an argument — with good cause, since a state machine threaded through a
 * parameter is one accidental copy away from silently losing its position.
 */
class Scanner {
  #mode: Mode = 'text';
  #tagName = '';
  #attrName = '';
  #quote = '';
  #closingTag = false;
  /** The element whose raw text we are inside, and whether escaping is meaningful in it. */
  #rawTag = '';
  #rawTagEscapable = false;
  #tail = '';

  /**
   * Advances across one static chunk. `reconsume` is why this is an index loop rather than a
   * `for…of`: several transitions decide a character belongs to the *next* mode, and re-reading it
   * there is what keeps `<a /class="b">` and `<a b=c d>` parsing the way a browser parses them.
   */
  advance(chunk: string): void {
    let index = 0;

    while (index < chunk.length) {
      const character = chunk[index] ?? '';

      if (!this.#step(character)) index += 1;
    }
  }

  /** Returns whether the character must be reconsidered in the mode this step moved to. */
  // A tokenizer is a table of transitions, and it is long for that reason: splitting it into one
  // function per mode would scatter a single specification across fifteen call sites and hide the
  // one property that matters — that every state resolves to an outcome.
  #step(character: string): boolean {
    switch (this.#mode) {
      case 'text':
        if (character === '<') this.#mode = 'tagOpen';

        return false;

      case 'tagOpen':
        if (character === '/') {
          this.#closingTag = true;
          this.#tagName = '';
          this.#mode = 'tagName';

          return false;
        }
        if (character === '!') {
          this.#mode = 'markupDeclaration';
          this.#tail = '';

          return false;
        }
        if (ASCII_ALPHA.test(character)) {
          this.#closingTag = false;
          this.#tagName = '';
          this.#mode = 'tagName';

          return true;
        }
        // `<` followed by anything else is literal text, exactly as a browser reads it.
        this.#mode = 'text';

        return true;

      case 'tagName':
        if (WHITESPACE.has(character)) this.#mode = 'beforeAttrName';
        else if (character === '/') this.#mode = 'selfClosing';
        else if (character === '>') this.#closeTag();
        else this.#tagName += character.toLowerCase();

        return false;

      case 'beforeAttrName':
        if (WHITESPACE.has(character)) return false;
        if (character === '/') this.#mode = 'selfClosing';
        else if (character === '>') this.#closeTag();
        else {
          this.#attrName = '';
          this.#mode = 'attrName';

          return true;
        }

        return false;

      case 'attrName':
        if (WHITESPACE.has(character)) this.#mode = 'afterAttrName';
        else if (character === '=') this.#mode = 'beforeAttrValue';
        else if (character === '>') this.#closeTag();
        else if (character === '/') this.#mode = 'selfClosing';
        else this.#attrName += character.toLowerCase();

        return false;

      case 'afterAttrName':
        if (WHITESPACE.has(character)) return false;
        if (character === '=') this.#mode = 'beforeAttrValue';
        else if (character === '>') this.#closeTag();
        else if (character === '/') this.#mode = 'selfClosing';
        else {
          this.#attrName = '';
          this.#mode = 'attrName';

          return true;
        }

        return false;

      case 'beforeAttrValue':
        if (WHITESPACE.has(character)) return false;
        if (character === '"' || character === "'") {
          this.#quote = character;
          this.#mode = 'attrValueQuoted';
        } else if (character === '>') this.#closeTag();
        else {
          this.#mode = 'attrValueUnquoted';

          return true;
        }

        return false;

      case 'attrValueQuoted':
        if (character === this.#quote) this.#mode = 'afterAttrValueQuoted';

        return false;

      case 'attrValueUnquoted':
        if (WHITESPACE.has(character)) this.#mode = 'beforeAttrName';
        else if (character === '>') this.#closeTag();

        return false;

      case 'afterAttrValueQuoted':
        if (WHITESPACE.has(character)) this.#mode = 'beforeAttrName';
        else if (character === '/') this.#mode = 'selfClosing';
        else if (character === '>') this.#closeTag();
        else {
          this.#mode = 'beforeAttrName';

          return true;
        }

        return false;

      case 'selfClosing':
        if (character === '>') {
          // A self-closing tag has no content, so it never opens a raw-text element.
          this.#closingTag = true;
          this.#closeTag();

          return false;
        }
        this.#mode = 'beforeAttrName';

        return true;

      case 'markupDeclaration':
        this.#tail += character;
        if (this.#tail === '-') return false;
        if (this.#tail === '--') {
          this.#mode = 'comment';
          this.#tail = '';

          return false;
        }
        // A doctype, a CDATA section, a bogus declaration: it ends at the first `>` and, crucially,
        // is NOT a comment. Reading `<!doctype html>` as an unterminated comment would swallow the
        // whole document and refuse every hole in it.
        this.#mode = 'bogusComment';

        return true;

      case 'bogusComment':
        if (character === '>') {
          this.#mode = 'text';
          this.#tail = '';
        }

        return false;

      case 'comment':
        this.#tail = (this.#tail + character).slice(-3);
        if (this.#tail === '-->') {
          this.#mode = 'text';
          this.#tail = '';
        }

        return false;

      case 'rawText':
        this.#tail = (this.#tail + character.toLowerCase()).slice(-(this.#rawTag.length + 2));
        if (this.#tail === `</${this.#rawTag}`) {
          this.#closingTag = true;
          this.#tagName = this.#rawTag;
          this.#mode = 'tagName';
          this.#rawTag = '';
          this.#tail = '';
        }

        return false;
    }
  }

  #closeTag(): void {
    const opening = !this.#closingTag;

    if (opening && RAW_TEXT_TAGS.has(this.#tagName)) {
      this.#mode = 'rawText';
      this.#rawTag = this.#tagName;
      this.#rawTagEscapable = false;
    } else if (opening && RCDATA_TAGS.has(this.#tagName)) {
      this.#mode = 'rawText';
      this.#rawTag = this.#tagName;
      this.#rawTagEscapable = true;
    } else {
      this.#mode = 'text';
    }
    this.#tail = '';
  }

  /** Where the hole that follows the chunk just scanned would land. */
  context(): Context {
    switch (this.#mode) {
      case 'text':
        return { kind: 'text' };

      case 'rawText':
        return this.#rawTagEscapable
          ? { kind: 'text' }
          : {
              kind: 'refused',
              why:
                `a value cannot be interpolated into a <${this.#rawTag}> body: a browser decodes ` +
                'no character references there, so escaping does nothing',
            };

      case 'attrValueQuoted':
        return { kind: 'attribute', name: this.#attrName };

      case 'attrValueUnquoted':
      case 'beforeAttrValue':
        return {
          kind: 'refused',
          why:
            `a value cannot be interpolated into an unquoted attribute value (${this.#attrName}): ` +
            'a space ends the value and no escape prevents it. Quote the attribute',
        };

      case 'tagOpen':
      case 'tagName':
        return { kind: 'refused', why: 'a value cannot be interpolated into a tag name' };

      case 'beforeAttrName':
      case 'attrName':
      case 'afterAttrName':
      case 'afterAttrValueQuoted':
      case 'selfClosing':
        return { kind: 'refused', why: 'a value cannot be interpolated into an attribute name' };

      case 'comment':
      case 'markupDeclaration':
      case 'bogusComment':
        return {
          kind: 'refused',
          why: 'a value cannot be interpolated into a comment or a doctype',
        };
    }
  }
}

function renderInAttribute(value: string, name: string): string {
  if (name.startsWith('on')) {
    throw new UnsafeMarkupError(
      `${name} is an event handler: its value is script, and escaping it as markup would not ` +
        'make it safe. Build the behaviour server-side instead.',
    );
  }
  if (name === 'style') {
    throw new UnsafeMarkupError(
      'a value cannot be interpolated into a style attribute: its content is CSS, not markup. ' +
        'Use a class.',
    );
  }
  if (name === 'srcset') {
    throw new UnsafeMarkupError(
      'srcset holds a comma-separated list of URLs with descriptors; one sanitised URL would ' +
        'leave the rest of the list untouched.',
    );
  }

  return escape(URL_ATTRIBUTES.has(name) ? sanitiseUrl(value, name) : value);
}

function render(value: unknown, context: Context): string {
  if (context.kind === 'refused') throw new UnsafeMarkupError(`${context.why}.`);

  if (value === null || value === undefined || value === false) return '';

  if (value instanceof Html) {
    if (context.kind === 'attribute') {
      throw new UnsafeMarkupError(
        `markup cannot be interpolated into the ${context.name} attribute: an attribute holds ` +
          'text, and a nested template is markup.',
      );
    }

    return Html.read(value);
  }

  if (Array.isArray(value)) {
    return value.map((element: unknown) => render(element, context)).join('');
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value);

    return context.kind === 'attribute' ? renderInAttribute(text, context.name) : escape(text);
  }

  // `true`, objects, symbols, functions. Every one of them has a plausible-looking `String()` and
  // none of them has a rendering the author meant — `[object Object]` in a page is a bug that
  // shipped. Formatting is the caller's job, and this is where that is said.
  throw new UnsafeMarkupError(
    `a ${typeof value} has no rendering: format it before interpolating it. Only strings, ` +
      'numbers, nested templates, arrays of those, and null/undefined/false may be interpolated.',
  );
}

/**
 * The tag. `strings.length` is always `values.length + 1`, so the loop pairs each static chunk
 * with the hole that follows it and appends the final chunk after.
 */
export function html(strings: TemplateStringsArray, ...values: readonly unknown[]): Html {
  const scanner = new Scanner();
  let out = '';

  for (const [index, value] of values.entries()) {
    const chunk = strings[index] ?? '';
    out += chunk;
    scanner.advance(chunk);
    out += render(value, scanner.context());
  }

  return Html.of(out + (strings.at(-1) ?? ''));
}
