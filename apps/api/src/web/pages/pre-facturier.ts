import type { DeclineReason, InvoiceStatus } from '@erp/billing';
import type { CraStatus } from '@erp/timesheet';

import type { Persona } from '../../personas/catalogue.ts';
import { frenchDays, frenchEuros, frenchMonth } from '../format.ts';
import { LABELS } from '../labels.ts';
import { PATHS } from '../paths.ts';
import { html, type Html } from '../render/html.ts';
import { shell } from '../shell.ts';

/**
 * The pré-facturier: for one month and one office, what is billable and — for everything else —
 * why not.
 *
 * It is the first screen on which the two modules appear together, and they meet **here** rather
 * than in a query (ADR-0053). The billable half comes from `billing`, the `Cra` half from
 * `timesheet`, and the route is what puts them on one page.
 *
 * **`Tjm`, `Cjm` and margin are not in this table**, and that is the control rather than an
 * omission: they sit behind a reveal link to a logged single-record read (ADR-0052). The link is
 * rendered for `billing` too, which may not follow it — a refusal that names the rule teaches a
 * reader what a greyed-out button hides.
 */

export interface BillableRow {
  readonly invoiceId: string;
  readonly clientName: string;
  readonly status: InvoiceStatus;
  readonly invoiceNumber: string | null;
  readonly totalExcludingVatCents: number;
  readonly totalIncludingVatCents: number;
}

/** Why a half-day of this month is not on an invoice. Exactly two shapes, and they differ in kind. */
export type Blocking =
  /** The Cra was validated and the day still produced no line — ADR-0037's typed reason. */
  | { readonly kind: 'declined'; readonly reason: DeclineReason; readonly missionName: string }
  /** The Cra has not been validated, so nothing about it has reached billing yet. */
  | { readonly kind: 'notValidated'; readonly status: CraStatus };

export interface CraRow {
  readonly craId: string;
  readonly consultantId: string;
  readonly consultantName: string;
  readonly status: CraStatus;
  readonly recordedHalfDays: number;
  readonly blocking: readonly { readonly halfDays: number; readonly why: Blocking }[];
}

export interface PreFacturierView {
  /** `null` when this office has no Cra at all — an empty state, not a refusal. */
  readonly period: string | null;
  readonly offeredPeriods: readonly string[];
  readonly billable: readonly BillableRow[];
  readonly cras: readonly CraRow[];
  /** ADR-0054: half-days of a **closed** month that have not reached `Validated`. */
  readonly lateHalfDays: number;
  readonly periodClosed: boolean;
}

function filterForm(view: PreFacturierView): Html {
  return html`<form class="filter no-print" method="get" action="${PATHS.preFacturier}">
    <div>
      <label for="periode">${LABELS.cra.filter}</label><br />
      <select id="periode" name="periode">
        ${view.offeredPeriods.map((period) =>
          period === view.period
            ? html`<option value="${period}" selected="selected">${frenchMonth(period)}</option>`
            : html`<option value="${period}">${frenchMonth(period)}</option>`,
        )}
      </select>
    </div>
    <button type="submit">${LABELS.cra.apply}</button>
  </form>`;
}

function summary(view: PreFacturierView): Html {
  const billableCents = view.billable.reduce((total, row) => total + row.totalExcludingVatCents, 0);

  return html`<dl class="summary">
    <div>
      <dt>${LABELS.preFacturier.summaryBillable}</dt>
      <dd class="num">${frenchEuros(billableCents)}</dd>
    </div>
    <div>
      <dt>${LABELS.preFacturier.summaryLate}</dt>
      <dd class="num">
        ${frenchDays(view.lateHalfDays)}
        ${view.periodClosed ? null : html`<span class="hint">${LABELS.preFacturier.lateNoneYet}</span>`}
      </dd>
    </div>
    <div>
      <dt>${LABELS.preFacturier.summaryCras}</dt>
      <dd class="num">${String(view.cras.length)}</dd>
    </div>
  </dl>`;
}

function billableTable(view: PreFacturierView): Html {
  if (view.billable.length === 0) {
    return html`<div class="note"><p>${LABELS.preFacturier.billableEmpty}</p></div>`;
  }

  return html`<table>
    <caption>
      ${LABELS.preFacturier.billable}
    </caption>
    <thead>
      <tr>
        <th scope="col">${LABELS.preFacturier.client}</th>
        <th scope="col">${LABELS.preFacturier.invoiceStatus}</th>
        <th scope="col">${LABELS.preFacturier.invoiceNumber}</th>
        <th scope="col" class="num">${LABELS.preFacturier.totalExcludingVat}</th>
        <th scope="col" class="num">${LABELS.preFacturier.totalIncludingVat}</th>
      </tr>
    </thead>
    <tbody>
      ${view.billable.map(
        (row) =>
          html`<tr>
            <th scope="row">${row.clientName}</th>
            <td>${LABELS.preFacturier.invoiceStatuses[row.status]}</td>
            <td>${row.invoiceNumber ?? LABELS.preFacturier.notNumberedYet}</td>
            <td class="num">${frenchEuros(row.totalExcludingVatCents)}</td>
            <td class="num">${frenchEuros(row.totalIncludingVatCents)}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

function blockingCell(row: CraRow): Html {
  if (row.blocking.length === 0) {
    return html`<span class="hint">${LABELS.preFacturier.nothingBlocking}</span>`;
  }

  return html`<ul class="reasons">
    ${row.blocking.map(
      (item) =>
        html`<li>
          <strong>${frenchDays(item.halfDays)}</strong> —
          ${
            item.why.kind === 'declined'
              ? html`${item.why.missionName} : ${LABELS.preFacturier.declineReasons[item.why.reason]}`
              : html`${
                  item.why.status === 'submitted'
                    ? LABELS.preFacturier.awaitingManager
                    : LABELS.preFacturier.awaitingConsultant
                }`
          }
        </li>`,
    )}
  </ul>`;
}

function craTable(view: PreFacturierView, period: string): Html {
  if (view.cras.length === 0) {
    return html`<div class="note">
      <p><strong>${LABELS.preFacturier.crasEmpty}</strong></p>
      <p>${LABELS.preFacturier.crasEmptyHint}</p>
    </div>`;
  }

  return html`<table>
    <caption>
      ${LABELS.preFacturier.cras}
      <span class="hint">${LABELS.preFacturier.lateNote}</span>
    </caption>
    <thead>
      <tr>
        <th scope="col">${LABELS.preFacturier.consultant}</th>
        <th scope="col">${LABELS.preFacturier.craStatus}</th>
        <th scope="col" class="num">${LABELS.preFacturier.recorded}</th>
        <th scope="col">${LABELS.preFacturier.blocking}</th>
        <th scope="col"><span class="sr-only">${LABELS.preFacturier.reveal}</span></th>
      </tr>
    </thead>
    <tbody>
      ${view.cras.map(
        (row) =>
          html`<tr>
            <th scope="row">${row.consultantName}</th>
            <td>
              ${LABELS.cra.statuses[row.status]}
              ${
                view.periodClosed && row.status !== 'validated'
                  ? html`<span class="tag flagged">${LABELS.preFacturier.lateTag}</span>`
                  : null
              }
            </td>
            <td class="num">${frenchDays(row.recordedHalfDays)}</td>
            <td>${blockingCell(row)}</td>
            <td class="no-print">
              <a
                href="${`${PATHS.margin}/${row.consultantId}?periode=${period}`}"
                title="${LABELS.preFacturier.revealTitle}"
                >${LABELS.preFacturier.reveal}</a
              >
            </td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

export function preFacturierPage(view: PreFacturierView, persona: Persona | undefined): Html {
  if (view.period === null) {
    return shell(
      { title: LABELS.preFacturier.heading, persona },
      html`<h1>${LABELS.preFacturier.heading}</h1>
        <div class="note">
          <p><strong>${LABELS.preFacturier.noPeriod}</strong></p>
          <p>${LABELS.preFacturier.noPeriodHint}</p>
        </div>`,
    );
  }

  const heading = `${LABELS.preFacturier.heading} — ${frenchMonth(view.period)}`;

  return shell(
    { title: heading, persona },
    html`<h1>${heading}</h1>
      <p class="lead">${LABELS.preFacturier.lead}</p>
      ${filterForm(view)} ${summary(view)} ${billableTable(view)}
      ${craTable(view, view.period)}`,
  );
}
