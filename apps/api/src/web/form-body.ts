import type { FastifyInstance } from 'fastify';

import { ApiFailure } from '../errors.ts';

/**
 * `application/x-www-form-urlencoded`, parsed by `URLSearchParams`.
 *
 * Fastify parses JSON and nothing else, and every write in these screens is a form submission
 * (ADR-0009: no script, so no `fetch`). The usual answer is `@fastify/formbody`; this is nine
 * lines of standard library, and BUILD-RULES' dependency ritual is not worth paying for them.
 *
 * Two things it does that a naive `Object.fromEntries` does not:
 *
 * - **Repeated names become arrays.** The Cra grid posts one field per day under the same name,
 *   and `fromEntries` would keep the last one and lose the month.
 * - **The object has a null prototype.** A field literally named `__proto__` is then an ordinary
 *   own property with no way to reach `Object.prototype`, so a form post cannot pollute it.
 */

const MAX_FIELDS = 500;

export function registerFormBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, body: string, done) => {
      const parsed = new URLSearchParams(body);
      const fields: Record<string, string | string[]> = Object.create(null) as Record<
        string,
        string | string[]
      >;
      let count = 0;

      for (const [name, value] of parsed) {
        count += 1;
        if (count > MAX_FIELDS) {
          // The body limit already caps the bytes; this caps the *shape*, which is what a
          // parameter flood attacks. It is a fact about the request, so it is a 400 (ADR-0042).
          done(
            Object.assign(new ApiFailure('too many form fields'), { statusCode: 400 }),
            undefined,
          );

          return;
        }

        const existing = fields[name];
        if (existing === undefined) fields[name] = value;
        else if (Array.isArray(existing)) existing.push(value);
        else fields[name] = [existing, value];
      }

      done(null, fields);
    },
  );
}
