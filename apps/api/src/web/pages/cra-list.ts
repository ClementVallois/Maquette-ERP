import type { CraListItem } from '@erp/timesheet';

import type { Persona } from '../../personas/catalogue.ts';
import { frenchMonth } from '../format.ts';
import { LABELS } from '../labels.ts';
import { PATHS } from '../paths.ts';
import { html, type Html } from '../render/html.ts';
import { shell } from '../shell.ts';

/**
 * The consultant's own months.
 *
 * The **filter lives in the URL** (BUILD-PLAN 6.6), which is what makes every view shareable — and
 * it is also what makes the empty state observable. Until this screen existed, the only empty list
 * on the seeded instance was `manager-lyon`'s, which is an *authorization* absence wearing an empty
 * state's clothes; conflating the two is exactly what ADR-0003's demonstration exists to separate.
 * A consultant asking for a month they simply did not work gets an empty list with no refusal in
 * it, and the page says as much.
 */

export interface CraListView {
  readonly cras: readonly CraListItem[];
  /** The period asked for in the query string, or `null` for "every month". */
  readonly filter: string | null;
  readonly offeredPeriods: readonly string[];
}

function row(cra: CraListItem): Html {
  const status = cra.status as keyof typeof LABELS.cra.statuses;

  return html`<tr>
    <td>${frenchMonth(cra.period)}</td>
    <td>${LABELS.cra.statuses[status]}</td>
    <td>
      <a href="${`${PATHS.consultantCra}/${cra.period}`}">${LABELS.cra.show}</a>
    </td>
  </tr>`;
}

function filterForm(view: CraListView): Html {
  return html`<form class="filter no-print" method="get" action="${PATHS.consultantCra}">
    <div>
      <label for="periode">${LABELS.cra.filter}</label><br />
      <select id="periode" name="periode">
        <option value="">${LABELS.cra.allPeriods}</option>
        ${view.offeredPeriods.map((period) =>
          period === view.filter
            ? html`<option value="${period}" selected="selected">${frenchMonth(period)}</option>`
            : html`<option value="${period}">${frenchMonth(period)}</option>`,
        )}
      </select>
    </div>
    <button type="submit">${LABELS.cra.apply}</button>
  </form>`;
}

function table(view: CraListView): Html {
  if (view.cras.length === 0) {
    return html`<div class="note">
      <p><strong>${LABELS.cra.emptyList}</strong></p>
      <p>${LABELS.cra.emptyListHint}</p>
    </div>`;
  }

  return html`<table>
    <thead>
      <tr>
        <th scope="col">${LABELS.cra.period}</th>
        <th scope="col">${LABELS.cra.status}</th>
        <th scope="col"><span class="sr-only">${LABELS.cra.show}</span></th>
      </tr>
    </thead>
    <tbody>
      ${view.cras.map(row)}
    </tbody>
  </table>`;
}

export function craListPage(view: CraListView, persona: Persona | undefined): Html {
  return shell(
    { title: LABELS.cra.listHeading, persona },
    html`<h1>${LABELS.cra.listHeading}</h1>
      ${filterForm(view)} ${table(view)}`,
  );
}
