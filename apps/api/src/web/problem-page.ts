import { API_PROBLEM_TYPES, type ProblemDetails } from '@erp/contracts';

import type { Persona } from '../personas/catalogue.ts';

import { LABELS } from './labels.ts';
import { PATHS } from './paths.ts';
import { html, type Html } from './render/html.ts';
import { shell } from './shell.ts';

/**
 * A refusal, rendered.
 *
 * There is no second error vocabulary here, and ADR-0009 said there would not be: the page is
 * built from the **same `ProblemDetails` object** the API would have returned. A screen that
 * re-derived its own message from a status code would drift from the API within a phase, and the
 * refusal a reader sees would stop being the refusal the system made.
 *
 * `CLAUDE.md` calls these states deliverables rather than polish, and the reason is on this page:
 * a denied view that says "403" proves nothing about the authorization model, while one that names
 * `deniedBy` shows which of the three loci refused and can be checked against the ADR that put it
 * there.
 */

const FORBIDDEN = 403;
const NOT_FOUND = 404;
const CONFLICT = 409;
const UNPROCESSABLE = 422;

function headingFor(problem: ProblemDetails): string {
  if (problem.status === FORBIDDEN) return LABELS.problem.heading.denied;
  if (problem.status === NOT_FOUND) return LABELS.problem.heading.notFound;
  if (problem.status === CONFLICT) return LABELS.problem.heading.conflict;
  if (problem.status === UNPROCESSABLE) return LABELS.problem.heading.invalid;
  if (problem.type === API_PROBLEM_TYPES.internal) return LABELS.problem.heading.internal;

  return LABELS.problem.heading.malformed;
}

function fieldErrors(errors: ProblemDetails['errors']): Html | null {
  if (errors === undefined) return null;

  return html`<dl class="facts">
    ${Object.entries(errors).map(
      ([field, messages]) =>
        html`<dt>${field}</dt>
          <dd>${messages.join(' · ')}</dd>`,
    )}
  </dl>`;
}

export function problemPage(problem: ProblemDetails, persona: Persona | undefined): Html {
  const heading = headingFor(problem);

  return shell(
    { title: heading, persona },
    html`<h1>${heading}</h1>
      <div class="note refused">
        <p><strong>${problem.title}</strong></p>
        ${problem.detail === undefined ? null : html`<p>${problem.detail}</p>`}
      </div>
      <dl class="facts">
        <dt>type</dt>
        <dd>${problem.type}</dd>
        ${
          problem.deniedBy === undefined
            ? null
            : html`<dt>${LABELS.problem.deniedBy}</dt>
              <dd>${problem.deniedBy}</dd>`
        }
        ${
          problem.invariant === undefined
            ? null
            : html`<dt>${LABELS.problem.invariant}</dt>
              <dd>${problem.invariant}</dd>`
        }
        ${
          problem.correlationId === undefined
            ? null
            : html`<dt>${LABELS.problem.correlationId}</dt>
              <dd>${problem.correlationId}</dd>`
        }
      </dl>
      ${fieldErrors(problem.errors)}
      <p class="lead">${LABELS.problem.correlationHint}</p>
      <p><a href="${PATHS.home}">${LABELS.problem.back}</a></p>`,
  );
}
