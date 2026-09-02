import type { ReactElement } from 'react';

import { frenchEuros, frenchMonth } from '@/lib/format';
import { LABELS } from '@/lib/labels';

import type { InvoiceHistoryResponse, InvoiceStatus } from '../../factures/types';

/**
 * Rank A2. The header this dashboard used to carry said "no chart: the seed holds one period, and
 * a curve on one point is the visual lie task 8.4 explicitly refuses." That premise is dead —
 * measured against the live seed (2026-09-01): invoice history spans 2016→2026 across six real
 * (year, status) points, and three 2026 months (June/July/August) are densely filled.
 *
 * Two honest series, and only these two:
 * 1. Invoices by year and status, 2016→2026 — six real points, contrasting statuses.
 * 2. Billable HT for the three dense 2026 months — three bars, labelled as three months, never
 *    presented as a trend.
 *
 * **Forbidden**: a twelve-month monthly curve. It would render three bars and nine zeros — the
 * same visual lie under a new name.
 *
 * Hand-rolled inline SVG (no charting library — none exists in this repo and adding one is out of
 * scope). Colour is never the only carrier of meaning: every segment/bar also carries a text
 * label or is named in the table beneath it. Colours come from the existing status-colour tokens
 * (`styles/globals.css`'s `--status-invoice-*` custom properties, the same ones `StatusBadge`
 * reads) — this file has no colour literal of its own.
 */

const STATUS_ORDER: readonly InvoiceStatus[] = ['draft', 'issued', 'cancelledByCreditNote'];

const STATUS_COLOR_VAR: Record<InvoiceStatus, string> = {
  draft: 'var(--status-invoice-draft-dot)',
  issued: 'var(--status-invoice-issued-dot)',
  cancelledByCreditNote: 'var(--status-invoice-cancelled-dot)',
};

const CHART_WIDTH = 480;
const CHART_HEIGHT = 180;
const BAR_GAP = 12;

function ByYearChart({
  data,
}: {
  readonly data: InvoiceHistoryResponse['byYearAndStatus'];
}): ReactElement {
  const labels = LABELS.dashboard.history;
  const years = [...new Set(data.map((row) => row.year))].sort();
  const totalsByYear = new Map(
    years.map((year) => [
      year,
      data.filter((row) => row.year === year).reduce((total, row) => total + row.count, 0),
    ]),
  );
  const maxTotal = Math.max(1, ...totalsByYear.values());
  const barWidth = (CHART_WIDTH - BAR_GAP * (years.length - 1)) / years.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-card-title">{labels.byYearTitle}</h3>
        <p className="text-xs text-muted-foreground">{labels.byYearCaption}</p>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {STATUS_ORDER.map((status) => (
          <span key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block size-2.5 rounded-full"
              style={{ backgroundColor: STATUS_COLOR_VAR[status] }}
            />
            {LABELS.preFacturier.invoiceStatuses[status]}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${String(CHART_WIDTH)} ${String(CHART_HEIGHT + 24)}`}
        role="img"
        aria-label={`${labels.byYearTitle}. ${years
          .map((year) => `${year} : ${String(totalsByYear.get(year) ?? 0)}`)
          .join(', ')}.`}
        className="w-full"
      >
        <title>{labels.byYearTitle}</title>
        {years.map((year, index) => {
          const x = index * (barWidth + BAR_GAP);
          const total = totalsByYear.get(year) ?? 0;
          let cursorY = CHART_HEIGHT;

          return (
            <g key={year}>
              {STATUS_ORDER.map((status) => {
                const count = data.find((row) => row.year === year && row.status === status)?.count;
                if (count === undefined || count === 0) return null;

                const segmentHeight = (count / maxTotal) * CHART_HEIGHT;
                cursorY -= segmentHeight;

                return (
                  <rect
                    key={status}
                    x={x}
                    y={cursorY}
                    width={barWidth}
                    height={segmentHeight}
                    fill={STATUS_COLOR_VAR[status]}
                    className="transition-[height,y] duration-300 ease-out"
                  >
                    <title>
                      {year} — {LABELS.preFacturier.invoiceStatuses[status]} — {count}
                    </title>
                  </rect>
                );
              })}
              {total > 0 && (
                <text
                  x={x + barWidth / 2}
                  y={Math.max(10, cursorY - 4)}
                  textAnchor="middle"
                  className="fill-foreground text-[10px] tabular-nums"
                >
                  {total}
                </text>
              )}
              <text
                x={x + barWidth / 2}
                y={CHART_HEIGHT + 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {year}
              </text>
            </g>
          );
        })}
      </svg>

      <table className="w-full text-xs">
        <caption className="sr-only">{labels.tableCaption}</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th scope="col" className="py-1 pr-3 font-normal">
              {labels.year}
            </th>
            {STATUS_ORDER.map((status) => (
              <th key={status} scope="col" className="py-1 pr-3 font-normal">
                {LABELS.preFacturier.invoiceStatuses[status]}
              </th>
            ))}
            <th scope="col" className="py-1 font-normal">
              {labels.total}
            </th>
          </tr>
        </thead>
        <tbody>
          {years.map((year) => (
            <tr key={year} className="tabular-nums text-foreground">
              <td className="py-1 pr-3">{year}</td>
              {STATUS_ORDER.map((status) => (
                <td key={status} className="py-1 pr-3">
                  {data.find((row) => row.year === year && row.status === status)?.count ?? 0}
                </td>
              ))}
              <td className="py-1 font-medium">{totalsByYear.get(year) ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DenseMonthsChart({
  data,
}: {
  readonly data: InvoiceHistoryResponse['denseMonths'];
}): ReactElement {
  const labels = LABELS.dashboard.history;
  const maxCents = Math.max(1, ...data.map((row) => row.billableCents));
  const barWidth = (CHART_WIDTH - BAR_GAP * (data.length - 1)) / Math.max(1, data.length);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-card-title">{labels.denseMonthsTitle}</h3>
        <p className="text-xs text-muted-foreground">{labels.denseMonthsCaption}</p>
      </div>

      <svg
        viewBox={`0 0 ${String(CHART_WIDTH)} ${String(CHART_HEIGHT + 24)}`}
        role="img"
        aria-label={`${labels.denseMonthsTitle}. ${data
          .map((row) => `${frenchMonth(row.period)} : ${frenchEuros(row.billableCents)}`)
          .join(', ')}.`}
        className="w-full"
      >
        <title>{labels.denseMonthsTitle}</title>
        {data.map((row, index) => {
          const x = index * (barWidth + BAR_GAP);
          const height = (row.billableCents / maxCents) * CHART_HEIGHT;
          const y = CHART_HEIGHT - height;

          return (
            <g key={row.period}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={height}
                fill="var(--primary)"
                className="transition-[height,y] duration-300 ease-out"
              >
                <title>
                  {frenchMonth(row.period)} — {frenchEuros(row.billableCents)}
                </title>
              </rect>
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                className="fill-foreground text-[10px] tabular-nums"
              >
                {frenchEuros(row.billableCents)}
              </text>
              <text
                x={x + barWidth / 2}
                y={CHART_HEIGHT + 16}
                textAnchor="middle"
                className="fill-muted-foreground text-[10px]"
              >
                {frenchMonth(row.period)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function InvoiceHistoryChart({
  data,
}: {
  readonly data: InvoiceHistoryResponse;
}): ReactElement {
  return (
    <section className="flex flex-col gap-6 rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
      <h2 className="text-card-title">{LABELS.dashboard.history.heading}</h2>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ByYearChart data={data.byYearAndStatus} />
        <DenseMonthsChart data={data.denseMonths} />
      </div>
    </section>
  );
}
