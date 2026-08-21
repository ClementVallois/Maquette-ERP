import type { CraFlag, CraLine, CraStatus, NonWorkableDay } from '@erp/timesheet';

import type { Persona } from '../../personas/catalogue.ts';
import { frenchDate, frenchDays, frenchMonth, frenchWeekday } from '../format.ts';
import { LABELS } from '../labels.ts';
import { PATHS } from '../paths.ts';
import { html, type Html } from '../render/html.ts';
import { shell } from '../shell.ts';

/**
 * The month as a record of working time, printable and countersignable (ADR-0056).
 *
 * It shows the **whole** month — absences and non-billable missions included — because a record of
 * working time with the inconvenient rows removed is not one. The signature block names nobody:
 * a `Cra` is per consultant and per month, a month is worked across missions, and who countersigns
 * is a fact about the errand rather than about the record. ADR-0056 carries the argument and its
 * threshold.
 */

export interface CraPrintView {
  readonly craId: string;
  readonly consultantName: string;
  readonly officeName: string;
  readonly period: string;
  readonly status: CraStatus;
  readonly lines: readonly CraLine[];
  readonly flags: readonly CraFlag[];
  readonly validatedBy: string | null;
  readonly validatedAt: string | null;
  /** Mission id → printed name. An absence has no mission and prints as one. */
  readonly missionNames: ReadonlyMap<string, string>;
}

function nameOf(line: CraLine, view: CraPrintView): string {
  if (line.dayType === 'absence') return LABELS.cra.absence;

  const missionId = line.missionId;

  return missionId === null ? LABELS.cra.nothing : (view.missionNames.get(missionId) ?? missionId);
}

function dayRows(view: CraPrintView): Html {
  // Ordered by day, then by the printed name, so a day split between two missions reads in a
  // stable order rather than in the order the rows came back.
  const ordered = [...view.lines].sort(
    (left, right) =>
      left.day.localeCompare(right.day) || nameOf(left, view).localeCompare(nameOf(right, view)),
  );

  return html`${ordered.map(
    (line) =>
      html`<tr>
        <th scope="row">
          <span class="weekday">${frenchWeekday(line.day)}</span> ${frenchDate(line.day)}
          ${flagOf(line.day, view.flags)}
        </th>
        <td>${nameOf(line, view)}</td>
        <td class="num">${frenchDays(line.halfDays)}</td>
      </tr>`,
  )}`;
}

function flagOf(day: string, flags: readonly CraFlag[]): Html | null {
  const flag = flags.find((candidate) => candidate.day === day);
  if (flag === undefined) return null;

  const reason: NonWorkableDay = flag.reason;

  return html`<span class="tag flagged">${LABELS.cra.nonWorkable[reason]}</span>`;
}

/** Per mission, and the month's total under it — the two numbers a signatory checks. */
function totalsTable(view: CraPrintView): Html {
  const perName = new Map<string, number>();
  for (const line of view.lines) {
    const name = nameOf(line, view);
    perName.set(name, (perName.get(name) ?? 0) + line.halfDays);
  }

  const total = view.lines.reduce((sum, line) => sum + line.halfDays, 0);

  return html`<table class="totals">
    <caption>
      ${LABELS.craPrint.totals}
    </caption>
    <tbody>
      ${[...perName]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(
          ([name, halfDays]) =>
            html`<tr>
              <th scope="row">${name}</th>
              <td class="num">${frenchDays(halfDays)}</td>
            </tr>`,
        )}
    </tbody>
    <tfoot>
      <tr>
        <th scope="row">${LABELS.craPrint.total}</th>
        <td class="num">${frenchDays(total)}</td>
      </tr>
    </tfoot>
  </table>`;
}

function signatureBlock(): Html {
  return html`<section class="signature">
    <h2>${LABELS.craPrint.signature}</h2>
    <p class="hint">${LABELS.craPrint.signatureNote}</p>
    <dl class="signature-fields">
      <dt>${LABELS.craPrint.signatureName}</dt>
      <dd></dd>
      <dt>${LABELS.craPrint.signatureDate}</dt>
      <dd></dd>
      <dt>${LABELS.craPrint.signatureMark}</dt>
      <dd class="tall"></dd>
    </dl>
  </section>`;
}

export function craPrintPage(view: CraPrintView, persona: Persona | undefined): Html {
  const heading = `${LABELS.craPrint.heading} — ${frenchMonth(view.period)}`;

  return shell(
    { title: heading, persona },
    html`<article class="document">
      <h1>${heading}</h1>
      ${
        view.status === 'validated'
          ? null
          : html`<div class="note no-print"><p>${LABELS.craPrint.notValidated}</p></div>`
      }
      <dl class="facts">
        <dt>${LABELS.craPrint.consultant}</dt>
        <dd>${view.consultantName}</dd>
        <dt>${LABELS.craPrint.office}</dt>
        <dd>${view.officeName}</dd>
        <dt>${LABELS.craPrint.period}</dt>
        <dd>${frenchMonth(view.period)}</dd>
        <dt>${LABELS.craPrint.status}</dt>
        <dd>${LABELS.cra.statuses[view.status]}</dd>
        ${
          view.validatedBy === null
            ? null
            : html`<dt>${LABELS.craPrint.validatedBy}</dt>
              <dd>${view.validatedBy}</dd>`
        }
        ${
          view.validatedAt === null
            ? null
            : html`<dt>${LABELS.craPrint.validatedOn}</dt>
              <dd>${frenchDate(view.validatedAt)}</dd>`
        }
      </dl>
      ${
        view.lines.length === 0
          ? html`<p class="lead">${LABELS.craPrint.nothingRecorded}</p>`
          : html`<table class="lines">
              <thead>
                <tr>
                  <th scope="col">${LABELS.craPrint.day}</th>
                  <th scope="col">${LABELS.craPrint.mission}</th>
                  <th scope="col" class="num">${LABELS.craPrint.quantity}</th>
                </tr>
              </thead>
              <tbody>
                ${dayRows(view)}
              </tbody>
            </table>
            ${totalsTable(view)}`
      }
      ${view.flags.length === 0 ? null : html`<p class="hint">${LABELS.craPrint.flaggedNote}</p>`}
      ${signatureBlock()}
      <p class="actions no-print">
        <a href="${`${PATHS.consultantCra}/${view.period}`}">${LABELS.craPrint.back}</a>
      </p>
    </article>`,
  );
}
