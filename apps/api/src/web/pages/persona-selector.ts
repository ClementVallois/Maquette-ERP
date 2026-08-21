import type { Persona } from '../../personas/catalogue.ts';
import { LABELS } from '../labels.ts';
import { PATHS } from '../paths.ts';
import { html, type Html } from '../render/html.ts';
import { shell } from '../shell.ts';

/**
 * The front door (ADR-0023). It is the first screen a cold reader meets, so it carries the
 * disclosure rather than burying it: **this is not a login**, anyone may take any identity, and
 * that is deliberate because it makes authorization demonstrable in three clicks where a real
 * identity provider would make it invisible.
 *
 * Two personas share the `manager` role in different offices. That is not decoration — it is what
 * lets a reader reproduce an out-of-scope refusal by switching identity rather than being told
 * about it, and the card says which office each one bounds.
 */

function card(persona: Persona): Html {
  return html`<li class="panel">
    <h2>${persona.displayName}</h2>
    <p>
      <span class="tag role-${persona.role}">${LABELS.roles[persona.role]}</span>
    </p>
    <dl class="facts">
      <dt>${LABELS.persona.office}</dt>
      <dd>${persona.officeName}</dd>
      <dt>${LABELS.persona.role}</dt>
      <dd>${persona.role}</dd>
    </dl>
    <form method="post" action="${PATHS.choosePersona}">
      <input type="hidden" name="key" value="${persona.key}" />
      <button type="submit">${LABELS.persona.choose}</button>
    </form>
  </li>`;
}

export function personaSelectorPage(
  personas: readonly Persona[],
  current: Persona | undefined,
): Html {
  return shell(
    { title: LABELS.persona.heading, persona: current },
    html`<h1>${LABELS.persona.heading}</h1>
      <p class="lead">${LABELS.persona.lead}</p>
      <div class="note">
        <p>${LABELS.persona.warning}</p>
      </div>
      <ul class="grid">
        ${personas.map(card)}
      </ul>`,
  );
}
