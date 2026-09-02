import type { ColumnDef } from '@tanstack/react-table';
import type { ReactElement } from 'react';
import { useState } from 'react';

import { BusinessTimeline } from '@/components/business-timeline';
import { DataTable } from '@/components/data-table/data-table';
import { DeniedState } from '@/components/feedback/denied-state';
import { ErrorState } from '@/components/feedback/error-state';
import { StatCard } from '@/components/stat-card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Role } from '@/features/session/types';
import { ApiProblemError } from '@/lib/api-client';
import { frenchDate, frenchDays, frenchEuros, frenchMonth, frenchPercent } from '@/lib/format';
import { LABELS } from '@/lib/labels';
import { classifyProblem, headingFor, sentenceFor } from '@/lib/problems';

import { useInvoiceDetail } from '../hooks';
import type {
  InvoiceDetail,
  InvoiceLine,
  InvoiceLineage,
  InvoiceStatus,
  PostalAddress,
  VatGroup,
} from '../types';

import { IssuanceDialog } from './issuance-dialog';

/**
 * `/facture/:id` (SSR, `apps/api/src/web/paths.ts`'s `PATHS.invoice`), not imported: `apps/web`
 * may only import `@erp/contracts` across the API boundary (§2) — same literal-copy reasoning
 * `cra-grid-screen.tsx`'s own `CRA_PRINT_PATH` already documents for `/releve`.
 */
const INVOICE_PRINT_PATH = '/facture';
const CRA_PRINT_PATH = '/releve';

function DetailSkeleton(): ReactElement {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-2 gap-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function formatAddress(address: PostalAddress): string {
  const line2 = address.line2 === null ? '' : `, ${address.line2}`;

  return `${address.line1}${line2}, ${address.postalCode} ${address.city}, ${address.country}`;
}

interface InfoBlockProps {
  readonly title: string;
  readonly rows: readonly (readonly [label: string, value: string])[];
}

/** A vendeur/facturé/faits block: a title and a `<dl>` of label/value pairs — the same "one small
 * `<dl>`" shape `denied-state.tsx` already uses for its own two-row summary, reused here for six
 * different blocks rather than six bespoke layouts. */
function InfoBlock({ title, rows }: InfoBlockProps): ReactElement {
  return (
    <div className="flex flex-col gap-2 rounded-xl bg-card p-5 shadow-card ring-1 ring-border">
      <h3 className="text-card-title">{title}</h3>
      <dl className="flex flex-col gap-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function termsSentence(terms: InvoiceDetail['terms']): string {
  const template = LABELS.invoice.terms[terms.kind];

  return template.replace('{days}', String(terms.days));
}

function vatRateCell(treatment: InvoiceLine['vat']): string {
  return treatment.kind === 'taxable'
    ? frenchPercent(treatment.basisPoints)
    : LABELS.invoice.notCharged;
}

function lineColumns(): ColumnDef<InvoiceLine>[] {
  return [
    {
      id: 'designation',
      header: LABELS.invoice.designation,
      cell: ({ row }) => row.original.designation,
    },
    {
      id: 'origin',
      header: LABELS.invoice.origin,
      cell: ({ row }) => (
        <a
          href={`${CRA_PRINT_PATH}/${row.original.origin.craId}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-[0.75rem] text-primary underline underline-offset-2"
        >
          {frenchMonth(row.original.origin.period)}
        </a>
      ),
    },
    {
      id: 'quantity',
      header: LABELS.invoice.quantity,
      cell: ({ row }) => <span className="tabular-nums">{row.original.quantityQuarterDays}</span>,
    },
    {
      id: 'unitPrice',
      header: LABELS.invoice.unitPrice,
      cell: ({ row }) => (
        <span className="tabular-nums">{frenchEuros(row.original.unitPriceCents)}</span>
      ),
    },
    {
      id: 'vatRate',
      header: LABELS.invoice.vatRate,
      cell: ({ row }) => vatRateCell(row.original.vat),
    },
    {
      id: 'amount',
      header: LABELS.invoice.amount,
      cell: ({ row }) => (
        <span className="tabular-nums">{frenchEuros(row.original.amountCents)}</span>
      ),
    },
  ];
}

function LineageCard({ item, index }: { item: InvoiceLineage; index: number }): ReactElement {
  const vat = item.vatGroup;

  return (
    <details className="rounded-xl bg-card p-4 shadow-card ring-1 ring-border" open={index === 0}>
      <summary className="cursor-pointer font-medium text-foreground">
        {LABELS.invoice.lineage.line.replace('{number}', String(index + 1))} — {item.missionName}
      </summary>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-6">
        <div>
          <p className="text-muted-foreground">{LABELS.invoice.lineage.cra}</p>
          <a
            href={`${CRA_PRINT_PATH}/${item.craId}`}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            {frenchMonth(item.period)}
          </a>
          <ul className="mt-1 text-xs text-muted-foreground">
            {item.sourceDays.map((sourceDay) => (
              <li key={sourceDay.day}>
                {frenchDate(sourceDay.day)} · {frenchDays(sourceDay.quarterDays)}
              </li>
            ))}
          </ul>
        </div>
        <LineageStep label={LABELS.invoice.lineage.mission} value={item.missionName} />
        <LineageStep
          label={LABELS.invoice.lineage.quantityAndRate}
          value={`${frenchDays(item.quantityQuarterDays)} × ${frenchEuros(item.tjmCents)} / j`}
        />
        <LineageStep
          label={LABELS.invoice.lineage.lineExcludingVat}
          value={frenchEuros(item.lineAmountCents)}
        />
        <LineageStep
          label={LABELS.invoice.lineage.vatGroup}
          value={
            vat === null
              ? LABELS.invoice.lineage.unavailable
              : `${vatRateCell(vat.treatment)} · ${frenchEuros(vat.baseCents)} HT · ${
                  vat.vatCents === null ? LABELS.invoice.notCharged : frenchEuros(vat.vatCents)
                }`
          }
        />
        <LineageStep
          label={LABELS.invoice.lineage.invoiceIncludingVat}
          value={frenchEuros(item.invoiceTotalTtcCents)}
        />
      </div>
    </details>
  );
}

function LineageStep({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="border-l-2 border-primary/30 pl-3">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium text-foreground">{value}</p>
    </div>
  );
}

function vatColumns(): ColumnDef<VatGroup>[] {
  return [
    {
      id: 'rate',
      header: LABELS.invoice.vatRate,
      cell: ({ row }) => vatRateCell(row.original.treatment),
    },
    {
      id: 'base',
      header: LABELS.invoice.vatBase,
      cell: ({ row }) => (
        <span className="tabular-nums">{frenchEuros(row.original.baseCents)}</span>
      ),
    },
    {
      id: 'amount',
      header: LABELS.invoice.vatAmount,
      cell: ({ row }) =>
        row.original.vatCents === null ? (
          <span className="text-muted-foreground">{LABELS.preFacturier.notNumberedYet}</span>
        ) : (
          <span className="tabular-nums">{frenchEuros(row.original.vatCents)}</span>
        ),
    },
  ];
}

interface InvoiceDetailScreenProps {
  readonly id: string;
  readonly role: Role;
}

/**
 * `/factures/$id` (task 8.2). Blocs vendeur/client, faits, table des lignes, récapitulatif TVA
 * par taux, totaux **sauf pour un `draft`** (`data.totals` is `null` only then, on the wire —
 * never computed here). Lien « Version imprimable » vers la SSR `/facture/:id`. Task 8.3's
 * issuance button/dialog is `billing`-only, `IssuanceDialog`.
 */
export function InvoiceDetailScreen({ id, role }: InvoiceDetailScreenProps): ReactElement {
  const query = useInvoiceDetail(id);
  const [issuing, setIssuing] = useState(false);

  if (query.isPending) return <DetailSkeleton />;

  if (query.isError) {
    const error = query.error;
    if (error instanceof ApiProblemError) {
      const action = classifyProblem(error.problem);
      if (action.kind === 'denied') {
        return <DeniedState deniedBy={action.deniedBy} role={role} />;
      }

      return (
        <ErrorState
          title={headingFor(error.problem)}
          body={sentenceFor(error.problem)}
          {...(error.problem.correlationId === undefined
            ? {}
            : { correlationId: error.problem.correlationId })}
        />
      );
    }

    return (
      <ErrorState title={LABELS.problem.heading.internal} body={LABELS.shell.unexpectedErrorBody} />
    );
  }

  const data = query.data;
  const canIssue = role === 'billing';
  const alreadyIssued: InvoiceStatus = 'issued';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-card-title">{data.billedTo.name}</h2>
          <p className="text-sm text-muted-foreground">{frenchMonth(data.supplyPeriod)}</p>
        </div>
        <a
          href={`${INVOICE_PRINT_PATH}/${data.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-medium text-primary underline underline-offset-2"
        >
          {LABELS.invoice.printable}
        </a>
      </div>

      {data.status !== alreadyIssued && (
        <Alert>
          <AlertDescription>{LABELS.invoice.draftNotice}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        <InfoBlock
          title={LABELS.invoice.seller}
          rows={[
            [LABELS.invoice.siren, data.seller.siren],
            [LABELS.invoice.vatNumber, data.seller.intraCommunityVatNumber],
            [LABELS.invoice.rcs, data.seller.rcsRegistration],
            [LABELS.invoice.shareCapital, frenchEuros(data.seller.shareCapitalCents)],
          ]}
        />
        <InfoBlock
          title={LABELS.invoice.billedTo}
          rows={[
            [LABELS.invoice.siren, data.billedTo.siren ?? LABELS.preFacturier.notNumberedYet],
            [
              LABELS.invoice.vatNumber,
              data.billedTo.intraCommunityVatNumber ?? LABELS.preFacturier.notNumberedYet,
            ],
            [LABELS.invoice.deliveryAddress, formatAddress(data.billedTo.deliveryAddress)],
          ]}
        />
      </div>

      <InfoBlock
        title={LABELS.invoice.heading}
        rows={[
          [LABELS.invoice.number, data.invoiceNumber ?? LABELS.preFacturier.notNumberedYet],
          [
            LABELS.invoice.issueDate,
            data.issueDate === null
              ? LABELS.preFacturier.notNumberedYet
              : frenchDate(data.issueDate),
          ],
          [LABELS.invoice.supplyPeriod, frenchMonth(data.supplyPeriod)],
          [
            LABELS.invoice.operationCategory,
            LABELS.invoice.operationCategories[data.mentions.operationCategory],
          ],
          [LABELS.invoice.paymentTerms, termsSentence(data.terms)],
        ]}
      />

      <BusinessTimeline
        title={LABELS.timeline.heading}
        items={data.timeline.map((item, index) => ({
          key: `${item.kind}-${item.at}-${String(index)}`,
          title: LABELS.timeline[item.kind],
          at: item.at,
          actorName: item.actorName,
        }))}
      />

      <section className="flex flex-col gap-2">
        <h3 className="text-card-title">{LABELS.invoice.lines}</h3>
        <p className="text-sm text-muted-foreground">{LABELS.invoice.originNote}</p>
        <DataTable
          columns={lineColumns()}
          data={data.lines}
          getRowId={(row) => row.origin.craId + row.designation}
          emptyState={null}
        />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-card-title">{LABELS.invoice.lineage.heading}</h3>
          <p className="text-sm text-muted-foreground">{LABELS.invoice.lineage.lead}</p>
        </div>
        {data.lineage.map((item, index) => (
          <LineageCard
            key={`${item.craId}-${item.missionId}-${String(index)}`}
            item={item}
            index={index}
          />
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-card-title">{LABELS.invoice.vatRecap}</h3>
        <DataTable
          columns={vatColumns()}
          data={data.vatBreakdown}
          getRowId={(row) => row.key}
          emptyState={null}
        />
      </section>

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard
            label={LABELS.invoice.totalExcludingVat}
            value={frenchEuros(data.totals.totalExcludingVatCents)}
          />
          <StatCard
            label={LABELS.invoice.totalVat}
            value={frenchEuros(data.totals.vatTotalCents)}
          />
          <StatCard
            label={LABELS.invoice.totalIncludingVat}
            value={frenchEuros(data.totals.totalIncludingVatCents)}
          />
        </div>
        {data.totalsAreProvisional && (
          <p className="text-sm text-muted-foreground">{LABELS.invoice.provisionalTotals}</p>
        )}
      </div>

      {canIssue && data.status !== alreadyIssued && (
        <div>
          <Button
            onClick={() => {
              setIssuing(true);
            }}
          >
            {LABELS.invoice.issue}
          </Button>
        </div>
      )}
      {canIssue && data.status === alreadyIssued && (
        <p className="text-sm text-muted-foreground">{LABELS.invoice.cannotIssue}</p>
      )}

      {issuing && (
        <IssuanceDialog
          invoice={data}
          onClose={() => {
            setIssuing(false);
          }}
        />
      )}
    </div>
  );
}
