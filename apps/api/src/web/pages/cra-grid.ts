import type { CraLine, CraStatus, DayType, NonWorkableDay } from '@erp/timesheet';

import type { Persona } from '../../personas/catalogue.ts';
import { frenchDate, frenchDays, frenchMonth, frenchWeekday } from '../format.ts';
import { LABELS } from '../labels.ts';
import { PATHS } from '../paths.ts';
import { html, type Html } from '../render/html.ts';
import { shell } from '../shell.ts';

/**
 * The Cra entry grid: days down, two half-day slots across.
 *
 * **Two slots per day, not a number of half-days typed in a box.** ADR-0012 makes the half-day the
 * storage unit, and this is the truest rendering of it — a day split between two missions is a
 * morning and an afternoon, which is how the consultant actually lived it, and it needs no special
 * case in the form. The alternative (a mission and a quantity per row) makes the split day the
 * exception it is not.
 *
 * **The totals are computed here, on the server, and are current as of the last save** — not live
 * per keystroke. ADR-0050 records that narrowing of BUILD-PLAN's wording and why it is not a
 * compromise: ADR-0049 forbids script, and ADR-0009's own reconsideration threshold names "a Cra
 * grid with client-side series entry" as the case that would reopen it. One grid is not ten
 * screens.
 *
 * **No "copy last month."** It copies last month's mistakes too, and a month that was wrong twice
 * is harder to argue with than a month that was wrong once.
 */

export interface GridDay {
  readonly date: string;
  /** `null` when the calendar says the day is workable. */
  readonly nonWorkable: NonWorkableDay | null;
  /** What is recorded in each slot: an absence, a mission id, or nothing. */
  readonly slots: readonly (SlotValue | null)[];
}

export type SlotValue = { kind: 'absence' } | { kind: 'mission'; missionId: string };

export interface GridMission {
  readonly id: string;
  readonly name: string;
}

export interface CraGridView {
  readonly period: string;
  /** `null` until the month has been saved once: there is no record to print yet. */
  readonly craId: string | null;
  readonly status: CraStatus | null;
  readonly days: readonly GridDay[];
  readonly missions: readonly GridMission[];
  readonly flags: readonly { day: string; reason: NonWorkableDay }[];
  readonly totals: readonly { missionId: string | null; dayType: DayType; halfDays: number }[];
  readonly editable: boolean;
  readonly refusal: { reason: string } | null;
}

const ABSENCE = 'absence';

function slotName(date: string, slot: number): string {
  return `${date}:${String(slot)}`;
}

function option(value: string, label: string, selected: boolean): Html {
  // `selected="selected"` rather than a bare `selected`: a hole between two attributes lands in
  // attribute-name position, which the renderer refuses outright (ADR-0025). The long form is the
  // one that can carry a value.
  return selected
    ? html`<option value="${value}" selected="selected">${label}</option>`
    : html`<option value="${value}">${label}</option>`;
}

function slotCell(day: GridDay, slot: number, view: CraGridView): Html {
  const value = day.slots[slot] ?? null;
  const current = value === null ? '' : value.kind === 'absence' ? ABSENCE : value.missionId;

  if (!view.editable) {
    return html`<td>${current === '' ? '—' : labelOfSlot(value, view)}</td>`;
  }

  return html`<td>
    <label class="sr-only" for="${slotName(day.date, slot)}"
      >${frenchDate(day.date)} — ${slot === 0 ? LABELS.cra.morning : LABELS.cra.afternoon}</label
    >
    <select id="${slotName(day.date, slot)}" name="${slotName(day.date, slot)}">
      ${option('', LABELS.cra.nothing, current === '')}
      ${option(ABSENCE, LABELS.cra.absence, current === ABSENCE)}
      ${view.missions.map((mission) => option(mission.id, mission.name, current === mission.id))}
    </select>
  </td>`;
}

function labelOfSlot(value: SlotValue | null, view: CraGridView): string {
  if (value === null) return '—';
  if (value.kind === 'absence') return LABELS.cra.absence;

  return view.missions.find((mission) => mission.id === value.missionId)?.name ?? value.missionId;
}

function dayRow(day: GridDay, view: CraGridView): Html {
  const flagged = view.flags.some((flag) => flag.day === day.date);

  return html`<tr class="${day.nonWorkable === null ? 'workable' : 'off'}">
    <th scope="row">
      <span class="weekday">${frenchWeekday(day.date)}</span>
      ${frenchDate(day.date)}
      ${
        day.nonWorkable === null
          ? null
          : html`<span class="tag off-tag">${LABELS.cra.nonWorkable[day.nonWorkable]}</span>`
      }
      ${flagged ? html`<span class="tag flagged">${LABELS.cra.flagged}</span>` : null}
    </th>
    ${slotCell(day, 0, view)} ${slotCell(day, 1, view)}
  </tr>`;
}

function totals(view: CraGridView): Html {
  if (view.totals.length === 0) {
    return html`<p class="lead">${LABELS.cra.nothingRecorded}</p>`;
  }

  return html`<table class="totals">
    <caption>
      ${LABELS.cra.totals}
      <span class="hint">${LABELS.cra.totalsAsOf}</span>
    </caption>
    <thead>
      <tr>
        <th scope="col">${LABELS.cra.mission}</th>
        <th scope="col">${LABELS.cra.quantity}</th>
      </tr>
    </thead>
    <tbody>
      ${view.totals.map(
        (total) =>
          html`<tr>
            <td>
              ${
                total.dayType === 'worked'
                  ? (view.missions.find((mission) => mission.id === total.missionId)?.name ??
                    total.missionId)
                  : LABELS.cra.absence
              }
            </td>
            <td class="num">${frenchDays(total.halfDays)}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

function statusNote(view: CraGridView): Html | null {
  if (view.status === null) return html`<div class="note">${LABELS.cra.notStartedYet}</div>`;
  if (view.status === 'draft') return null;

  if (view.status === 'refused') {
    return html`<div class="note refused">
      <p><strong>${LABELS.cra.refused}</strong></p>
      ${view.refusal === null ? null : html`<p>${view.refusal.reason}</p>`}
    </div>`;
  }

  // Submitted or validated: the domain refuses `recordDay` from here (ADR-0005), so the grid is
  // read-only. Saying **why** on the page is the difference between a form that will not save and
  // a form that explains itself — and it is the same reason the API's 409 carries.
  return html`<div class="note">
    <p>${LABELS.cra.readOnly[view.status]}</p>
  </div>`;
}

export function craGridPage(view: CraGridView, persona: Persona | undefined): Html {
  const heading = `${LABELS.cra.heading} — ${frenchMonth(view.period)}`;

  return shell(
    { title: heading, persona },
    html`<h1>${heading}</h1>
      ${statusNote(view)}
      <p class="lead">${LABELS.cra.slotsNote}</p>
      <form method="post" action="${`${PATHS.consultantCra}/${view.period}`}">
        <table class="grid-days">
          <thead>
            <tr>
              <th scope="col">${LABELS.cra.day}</th>
              <th scope="col">${LABELS.cra.morning}</th>
              <th scope="col">${LABELS.cra.afternoon}</th>
            </tr>
          </thead>
          <tbody>
            ${view.days.map((day) => dayRow(day, view))}
          </tbody>
        </table>
        ${
          view.editable
            ? html`<p class="actions no-print">
              <button type="submit" name="action" value="save">${LABELS.cra.save}</button>
              <button type="submit" name="action" value="submit">${LABELS.cra.submit}</button>
            </p>`
            : null
        }
      </form>
      ${totals(view)}
      ${
        view.craId === null
          ? null
          : html`<p class="actions no-print">
            <a href="${`${PATHS.craPrint}/${view.craId}`}">${LABELS.craPrint.open}</a>
          </p>`
      }`,
  );
}

/** Groups the recorded lines the way the totals table shows them: by mission, absences apart. */
export function totalsOf(
  lines: readonly CraLine[],
): { missionId: string | null; dayType: DayType; halfDays: number }[] {
  const perKey = new Map<
    string,
    { missionId: string | null; dayType: DayType; halfDays: number }
  >();

  for (const line of lines) {
    const key = `${line.dayType}:${line.missionId ?? ''}`;
    const existing = perKey.get(key);
    if (existing === undefined) {
      perKey.set(key, {
        missionId: line.missionId,
        dayType: line.dayType,
        halfDays: line.halfDays,
      });
    } else {
      existing.halfDays += line.halfDays;
    }
  }

  return [...perKey.values()].sort((left, right) => left.dayType.localeCompare(right.dayType));
}
