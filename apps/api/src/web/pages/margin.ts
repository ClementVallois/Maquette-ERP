import type { ConsultantEconomics } from '../../economics/consultant-economics.ts';
import type { Persona } from '../../personas/catalogue.ts';
import { frenchDays, frenchEuros, frenchMonth } from '../format.ts';
import { LABELS } from '../labels.ts';
import { PATHS } from '../paths.ts';
import { html, type Html } from '../render/html.ts';
import { shell } from '../shell.ts';

/**
 * The reveal: `Cjm`, `Tjm` and margin for one consultant and one month (ADR-0052).
 *
 * The screen is the visible half of the progressive-disclosure control. Reaching it costs a click
 * and a round trip, the read writes a disclosure line naming actor, fields and target, and the page
 * says so in the open — a control the reader cannot see is a control they cannot check.
 *
 * **No margin rate.** Amounts only: a percentage means dividing one monetary value by another, and
 * BUILD-RULES has no exception for "it is only for display".
 */

export function marginPage(economics: ConsultantEconomics, persona: Persona | undefined): Html {
  const heading = `${LABELS.margin.heading} — ${economics.displayName}`;

  return shell(
    { title: heading, persona },
    html`<h1>${heading}</h1>
      <p class="lead">${frenchMonth(economics.period)}</p>
      <div class="note">
        <p>${LABELS.margin.lead}</p>
      </div>
      <dl class="facts">
        <dt>${LABELS.margin.cjm}</dt>
        <dd>${frenchEuros(economics.cjmCents)}</dd>
      </dl>
      ${missionTable(economics)}
      <p class="actions no-print">
        <a href="${`${PATHS.preFacturier}?periode=${economics.period}`}">${LABELS.margin.back}</a>
      </p>`,
  );
}

function missionTable(economics: ConsultantEconomics): Html {
  if (economics.missions.length === 0) {
    return html`<div class="note"><p>${LABELS.margin.noMission}</p></div>`;
  }

  return html`<table>
    <thead>
      <tr>
        <th scope="col">${LABELS.margin.mission}</th>
        <th scope="col" class="num">${LABELS.margin.quantity}</th>
        <th scope="col" class="num">${LABELS.margin.tjm}</th>
        <th scope="col" class="num">${LABELS.margin.revenue}</th>
        <th scope="col" class="num">${LABELS.margin.cost}</th>
        <th scope="col" class="num">${LABELS.margin.margin}</th>
      </tr>
    </thead>
    <tbody>
      ${economics.missions.map(
        (mission) =>
          html`<tr>
            <th scope="row">${mission.missionName}</th>
            <td class="num">${frenchDays(mission.halfDays)}</td>
            <td class="num">${frenchEuros(mission.tjmCents)}</td>
            <td class="num">${frenchEuros(mission.revenueCents)}</td>
            <td class="num">${frenchEuros(mission.costCents)}</td>
            <td class="num">${frenchEuros(mission.marginCents)}</td>
          </tr>`,
      )}
    </tbody>
    <tfoot>
      <tr>
        <th scope="row">${LABELS.margin.total}</th>
        <td class="num"></td>
        <td class="num"></td>
        <td class="num">${frenchEuros(economics.revenueCents)}</td>
        <td class="num">${frenchEuros(economics.costCents)}</td>
        <td class="num">${frenchEuros(economics.marginCents)}</td>
      </tr>
    </tfoot>
  </table>`;
}
