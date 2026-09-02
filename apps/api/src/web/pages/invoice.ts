import type { Invoice, InvoiceLine, LegalEntity, PostalAddress, VatGroup } from '@erp/billing';

import type { Persona } from '../../personas/catalogue.ts';
import { fill } from '../fill.ts';
import { frenchDate, frenchDays, frenchEuros, frenchMonth, frenchPercent } from '../format.ts';
import { LABELS } from '../labels.ts';
import { PATHS } from '../paths.ts';
import { html, type Html } from '../render/html.ts';
import { shell } from '../shell.ts';

/**
 * The invoice as a document (ADR-0055): an HTML page with a print stylesheet, and no PDF engine.
 *
 * **Every mention on it is a field of the aggregate**, never a sentence typed here — that is
 * ADR-0017, and it is what makes "carries every legal mention" checkable. The three templated
 * strings below (`latePayment`, `recoveryIndemnity`, `discount`) carry a `{placeholder}` filled
 * from the model rather than a number written into the label, so a rate that changes on the
 * document changes on the page and a rate that is missing cannot be papered over with prose.
 *
 * A **draft** renders through the same function as an issued invoice, and says at the top that it
 * is not one. The alternative — a second page for drafts — is two renderers for one document, and
 * the one that stops printing a mention is always the one nobody looks at.
 */

export interface InvoiceView {
  readonly invoice: Invoice;
  /** `null` on a draft: an unissued document has no due date, because it has no issue date. */
  readonly dueDate: string | null;
  /**
   * The key this render minted for the issuance form, or `null` when this actor may not issue
   * (ADR-0059). It is per render and not per invoice: its job is to recognise **this submission
   * arriving twice**, and the state machine is what refuses a genuine second issuance.
   */
  readonly issuanceKey: string | null;
}

function address(postal: PostalAddress): Html {
  return html`<span class="address">
    ${postal.line1}${postal.line2 === null ? null : html`, ${postal.line2}`}<br />
    ${postal.postalCode} ${postal.city}<br />
    ${postal.country}
  </span>`;
}

function sellerBlock(seller: LegalEntity): Html {
  return html`<div class="party">
    <h2>${LABELS.invoice.seller}</h2>
    <p><strong>${seller.name}</strong> — ${seller.legalForm}</p>
    <p>${address(seller.address)}</p>
    <dl class="facts">
      <dt>${LABELS.invoice.shareCapital}</dt>
      <dd>${frenchEuros(seller.shareCapitalCents)}</dd>
      <dt>${LABELS.invoice.siren}</dt>
      <dd>${seller.siren}</dd>
      <dt>${LABELS.invoice.vatNumber}</dt>
      <dd>${seller.intraCommunityVatNumber}</dd>
      <dt>${LABELS.invoice.rcs}</dt>
      <dd>${seller.rcsRegistration}</dd>
    </dl>
  </div>`;
}

function billedToBlock(invoice: Invoice): Html {
  const party = invoice.billedTo;
  // Rendered even when it equals the billing address, and `billedParty` is why: the reform makes
  // the delivery address mandatory, so the model carries it rather than leaving a blank, and the
  // document prints what the model carries.
  return html`<div class="party">
    <h2>${LABELS.invoice.billedTo}</h2>
    <p><strong>${party.name}</strong></p>
    <p>${address(party.billingAddress)}</p>
    <dl class="facts">
      ${
        party.siren === null
          ? null
          : html`<dt>${LABELS.invoice.siren}</dt>
            <dd>${party.siren}</dd>`
      }
      ${
        party.intraCommunityVatNumber === null
          ? null
          : html`<dt>${LABELS.invoice.vatNumber}</dt>
            <dd>${party.intraCommunityVatNumber}</dd>`
      }
      <dt>${LABELS.invoice.deliveryAddress}</dt>
      <dd>${address(party.deliveryAddress)}</dd>
    </dl>
  </div>`;
}

function vatOf(line: InvoiceLine): string {
  return line.vat.kind === 'taxable'
    ? frenchPercent(line.vat.basisPoints)
    : LABELS.invoice.notCharged;
}

function lineTable(invoice: Invoice): Html {
  return html`<table class="lines">
    <thead>
      <tr>
        <th scope="col">${LABELS.invoice.designation}</th>
        <th scope="col" class="num">${LABELS.invoice.quantity}</th>
        <th scope="col" class="num">${LABELS.invoice.unitPrice}</th>
        <th scope="col" class="num">${LABELS.invoice.vatRate}</th>
        <th scope="col" class="num">${LABELS.invoice.amount}</th>
      </tr>
    </thead>
    <tbody>
      ${invoice.lines.map(
        (line) =>
          html`<tr>
            <th scope="row">${line.designation}</th>
            <td class="num">${frenchDays(line.quantityQuarterDays)}</td>
            <td class="num">${frenchEuros(line.unitPriceCents)}</td>
            <td class="num">${vatOf(line)}</td>
            <td class="num">${frenchEuros(line.amountCents)}</td>
          </tr>`,
      )}
    </tbody>
  </table>`;
}

/**
 * The recapitulative the document is legally required to print, one row per rate — which is also
 * the granularity VAT is rounded at (ADR-0010). A group that carries no French VAT prints its
 * mention in the tax column instead of a zero, because 0 % and "outside the scope" are different
 * declarations and not different numbers.
 */
function vatTable(groups: readonly VatGroup[], invoice: Invoice): Html {
  return html`<table class="vat">
    <caption>
      ${LABELS.invoice.vatRecap}
    </caption>
    <thead>
      <tr>
        <th scope="col">${LABELS.invoice.vatRate}</th>
        <th scope="col" class="num">${LABELS.invoice.vatBase}</th>
        <th scope="col" class="num">${LABELS.invoice.vatAmount}</th>
      </tr>
    </thead>
    <tbody>
      ${groups.map(
        (group) =>
          html`<tr>
            <th scope="row">
              ${
                group.treatment.kind === 'taxable'
                  ? frenchPercent(group.treatment.basisPoints)
                  : (group.mention ?? LABELS.invoice.notCharged)
              }
            </th>
            <td class="num">${frenchEuros(group.baseCents)}</td>
            <td class="num">
              ${group.vatCents === null ? LABELS.cra.nothing : frenchEuros(group.vatCents)}
            </td>
          </tr>`,
      )}
    </tbody>
    <tfoot>
      <tr>
        <th scope="row">${LABELS.invoice.totalExcludingVat}</th>
        <td class="num"></td>
        <td class="num">${frenchEuros(invoice.totals.totalExcludingVatCents)}</td>
      </tr>
      <tr>
        <th scope="row">${LABELS.invoice.totalVat}</th>
        <td class="num"></td>
        <td class="num">${frenchEuros(invoice.totals.vatTotalCents)}</td>
      </tr>
      <tr>
        <th scope="row">${LABELS.invoice.totalIncludingVat}</th>
        <td class="num"></td>
        <td class="num">
          <strong>${frenchEuros(invoice.totals.totalIncludingVatCents)}</strong>
        </td>
      </tr>
    </tfoot>
  </table>`;
}

function mentionsBlock(invoice: Invoice): Html {
  const mentions = invoice.mentions;

  return html`<section class="mentions">
    <h2>${LABELS.invoice.mentions}</h2>
    <ul>
      <li>
        ${fill(LABELS.invoice.latePayment, {
          rate: frenchPercent(mentions.latePaymentBasisPoints),
        })}
      </li>
      <li>
        ${fill(LABELS.invoice.recoveryIndemnity, {
          amount: frenchEuros(mentions.recoveryIndemnityCents),
        })}
      </li>
      <li>
        ${
          mentions.earlyPaymentDiscount.kind === 'none'
            ? LABELS.invoice.noDiscount
            : fill(LABELS.invoice.discount, {
                rate: frenchPercent(mentions.earlyPaymentDiscount.basisPoints),
              })
        }
      </li>
      <li>
        ${mentions.vatOnDebitsOption ? LABELS.invoice.vatOnDebits : LABELS.invoice.vatOnCollection}
      </li>
      ${invoice.vatBreakdown.map((group) =>
        group.mention === null ? null : html`<li>${group.mention}</li>`,
      )}
    </ul>
  </section>`;
}

/**
 * The trail, printed. Each line names the `Cra` it came from, which is what materialises the
 * *piste d'audit fiable* — the invoice is tied to the record of work, on the document itself and
 * not only in the database.
 */
function originBlock(invoice: Invoice): Html {
  return html`<section class="origin">
    <h2>${LABELS.invoice.origin}</h2>
    <p class="hint">${LABELS.invoice.originNote}</p>
    <ul>
      ${invoice.lines.map(
        (line) =>
          html`<li>
            ${fill(LABELS.invoice.originLine, {
              cra: line.origin.craId,
              period: frenchMonth(line.origin.period),
              mission: line.designation,
            })}
          </li>`,
      )}
    </ul>
  </section>`;
}

/**
 * Billing's one write. It is absent for every other role and for an invoice that already has a
 * number — but the route is what refuses, and this only decides what is offered.
 */
function issuanceForm(view: InvoiceView): Html | null {
  const key = view.issuanceKey;
  if (key === null) return null;

  if (view.invoice.number !== null) {
    return html`<div class="note no-print"><p>${LABELS.invoice.cannotIssue}</p></div>`;
  }

  return html`<section class="no-print">
    <p class="hint">${LABELS.invoice.issueNote}</p>
    <form method="post" action="${`${PATHS.issueInvoice}/${view.invoice.id}`}">
      <input type="hidden" name="idempotencyKey" value="${key}" />
      <button type="submit">${LABELS.invoice.issue}</button>
    </form>
  </section>`;
}

export function invoicePage(view: InvoiceView, persona: Persona | undefined): Html {
  const { invoice } = view;
  const number = invoice.number;
  const heading =
    number === null ? LABELS.invoice.draftHeading : `${LABELS.invoice.heading} ${number}`;

  return shell(
    { title: heading, persona },
    html`<article class="document">
      <div class="letterhead">
        <h1>${heading}</h1>
        <dl class="facts">
          <dt>${LABELS.invoice.number}</dt>
          <dd>${number ?? LABELS.cra.nothing}</dd>
          <dt>${LABELS.invoice.issueDate}</dt>
          <dd>
            ${invoice.issueDate === null ? LABELS.cra.nothing : frenchDate(invoice.issueDate)}
          </dd>
          <dt>${LABELS.invoice.dueDate}</dt>
          <dd>${view.dueDate === null ? LABELS.cra.nothing : frenchDate(view.dueDate)}</dd>
          <dt>${LABELS.invoice.supplyPeriod}</dt>
          <dd>${frenchMonth(invoice.supplyPeriod)}</dd>
          <dt>${LABELS.invoice.operationCategory}</dt>
          <dd>${LABELS.invoice.operationCategories[invoice.mentions.operationCategory]}</dd>
        </dl>
      </div>
      ${
        number === null
          ? html`<div class="note no-print"><p>${LABELS.invoice.draftNotice}</p></div>`
          : null
      }
      <div class="parties">${sellerBlock(invoice.seller)} ${billedToBlock(invoice)}</div>
      ${lineTable(invoice)} ${vatTable(invoice.vatBreakdown, invoice)} ${mentionsBlock(invoice)}
      ${originBlock(invoice)} ${issuanceForm(view)}
      <p class="actions no-print">
        <a href="${`${PATHS.preFacturier}?period=${invoice.supplyPeriod}`}"
          >${LABELS.margin.back}</a
        >
      </p>
    </article>`,
  );
}
