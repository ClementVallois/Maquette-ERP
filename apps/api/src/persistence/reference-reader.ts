import {
  type BillingReference,
  billingReference,
  type BillingModel,
  type Client,
  client as makeClient,
  commercialMission,
  type LegalEntity,
  legalEntity,
  type Territoriality,
} from '@erp/billing';
import { type IsoDate, isoDateOf } from '@erp/platform';
import {
  type Hierarchy,
  hierarchy,
  type HeldHabilitation,
  type TimesheetReference,
  timesheetReference,
} from '@erp/timesheet';

import { ApiFailure } from '../errors.ts';

import { exactCents } from './columns.ts';
import type { PgReadClient } from './pg-client.ts';

/**
 * Loading the two reference projections ADR-0031 gives each module, from the tables the seed is
 * the single writer of.
 *
 * It reads `public.*` only — never `timesheet.*`, never `billing.*`. That is the schema half of
 * the boundary: the composition root assembles what each module's rules read, and neither module
 * reads the other's schema any more than it imports the other's code.
 *
 * Loaded per request rather than cached. It is a handful of indexed reads against a dataset of
 * nine consultants; a cache would be a second place the truth lives, and the threshold for adding
 * one is a profiling run that names it.
 */

interface MissionRow {
  id: string;
  client_id: string;
  billing_model: string;
  start_date: Date | string;
  end_date: Date | string | null;
}

interface AssignmentRow {
  consultant_id: string;
  mission_id: string;
  from_date: Date | string;
  to_date: Date | string | null;
}

interface TjmRow {
  mission_id: string;
  from_date: Date | string;
  to_date: Date | string | null;
  tjm_cents: string | number;
}

interface ClientRow {
  id: string;
  name: string;
  siren: string | null;
  intra_community_vat_number: string | null;
  territoriality: string;
  billing_address_street: string;
  billing_address_postal_code: string;
  billing_address_city: string;
  billing_address_country: string;
  delivery_address_street: string | null;
  delivery_address_postal_code: string | null;
  delivery_address_city: string | null;
  delivery_address_country: string | null;
}

interface LegalEntityRow {
  id: string;
  name: string;
  legal_form: string;
  share_capital_cents: string | number;
  siren: string;
  intra_community_vat_number: string;
  rcs_registration: string;
  address_street: string;
  address_postal_code: string;
  address_city: string;
  address_country: string;
  number_prefix: string;
}

interface MissionHabilitationRow {
  mission_id: string;
  habilitation_id: string;
}

interface HeldHabilitationRow {
  consultant_id: string;
  habilitation_id: string;
  obtained_at: Date | string;
  expires_at: Date | string | null;
}

interface AttachmentRow {
  consultant_id: string;
  manager_id: string;
  from_date: Date | string;
  to_date: Date | string | null;
}

function bounds(
  from: Date | string,
  to: Date | string | null,
): { from: IsoDate; to: IsoDate | null } {
  return { from: isoDateOf(from), to: to === null ? null : isoDateOf(to) };
}

export class PgReferenceReader {
  readonly #client: PgReadClient;

  constructor(client: PgReadClient) {
    this.#client = client;
  }

  /**
   * What `timesheet`'s rules read: which missions run when, who is staffed on them, what clearance
   * each mission requires, and which clearances each consultant holds and until when.
   *
   * The last two joined this projection in Phase 6 and closed a hole the open-questions file had
   * been carrying since 21/08: migration 007 created `mission_habilitations` and
   * `consultant_habilitations`, the seed filled them, and nothing read them — so `CLAUDE.md`
   * § Dataset shape required an habilitation that "constrains an assignment" while no code
   * constrained anything (ADR-0051).
   */
  async timesheet(): Promise<TimesheetReference> {
    const { rows: missions } = await this.#client.query<MissionRow>(
      `SELECT id, client_id, billing_model, start_date, end_date FROM public.missions`,
    );
    const { rows: assignments } = await this.#client.query<AssignmentRow>(
      `SELECT consultant_id, mission_id, from_date, to_date FROM public.assignments`,
    );
    const { rows: required } = await this.#client.query<MissionHabilitationRow>(
      `SELECT mission_id, habilitation_id FROM public.mission_habilitations`,
    );
    const { rows: held } = await this.#client.query<HeldHabilitationRow>(
      `SELECT consultant_id, habilitation_id, obtained_at, expires_at
         FROM public.consultant_habilitations`,
    );

    return timesheetReference({
      missions: missions.map((row) => ({
        id: row.id,
        startDate: isoDateOf(row.start_date),
        endDate: row.end_date === null ? null : isoDateOf(row.end_date),
        requiredHabilitations: required
          .filter((requirement) => requirement.mission_id === row.id)
          .map((requirement) => requirement.habilitation_id),
      })),
      assignments: assignments.map((row) => ({
        consultantId: row.consultant_id,
        missionId: row.mission_id,
        ...bounds(row.from_date, row.to_date),
      })),
      held: held.map((row): HeldHabilitation => ({
        consultantId: row.consultant_id,
        habilitationId: row.habilitation_id,
        ...bounds(row.obtained_at, row.expires_at),
      })),
    });
  }

  /** What `billing`'s rules read: the commercial terms of a mission, and who it is sold to. */
  async billing(): Promise<BillingReference> {
    const { rows: missions } = await this.#client.query<MissionRow>(
      `SELECT id, client_id, billing_model, start_date, end_date FROM public.missions`,
    );
    const { rows: rates } = await this.#client.query<TjmRow>(
      `SELECT mission_id, from_date, to_date, tjm_cents FROM public.mission_tjm ORDER BY from_date`,
    );
    const { rows: clients } = await this.#client.query<ClientRow>(`SELECT * FROM public.clients`);

    return billingReference({
      missions: missions.map((row) =>
        commercialMission({
          id: row.id,
          clientId: row.client_id,
          billingModel: row.billing_model as BillingModel,
          tjmCents: rates
            .filter((rate) => rate.mission_id === row.id)
            .map((rate) => ({
              ...bounds(rate.from_date, rate.to_date),
              value: exactCents('tjm_cents', rate.tjm_cents),
            })),
        }),
      ),
      clients: clients.map(toClient),
    });
  }

  /** The firm, as it prints on an invoice. One row: this mockup has one legal entity. */
  async seller(): Promise<LegalEntity> {
    const { rows } = await this.#client.query<LegalEntityRow>(
      `SELECT * FROM public.legal_entities ORDER BY id LIMIT 1`,
    );
    const row = rows[0];
    if (row === undefined) {
      throw new ApiFailure('public.legal_entities is empty — run `pnpm run seed`');
    }

    return legalEntity({
      id: row.id,
      name: row.name,
      legalForm: row.legal_form,
      shareCapitalCents: exactCents('share_capital_cents', row.share_capital_cents),
      siren: row.siren,
      intraCommunityVatNumber: row.intra_community_vat_number,
      rcsRegistration: row.rcs_registration,
      address: {
        line1: row.address_street,
        line2: null,
        postalCode: row.address_postal_code,
        city: row.address_city,
        country: row.address_country,
      },
      numberPrefix: row.number_prefix,
    });
  }

  /** Consultant names, for the rows the pré-facturier lists. Presentation, not a rule. */
  async consultantNames(): Promise<ReadonlyMap<string, string>> {
    const { rows } = await this.#client.query<{
      id: string;
      first_name: string;
      last_name: string;
    }>(`SELECT id, first_name, last_name FROM public.consultants`);

    return new Map(rows.map((row) => [row.id, `${row.first_name} ${row.last_name}`]));
  }

  /** Office names, for the record a printable Cra carries. Presentation, not a rule. */
  async officeNames(): Promise<ReadonlyMap<string, string>> {
    const { rows } = await this.#client.query<{ id: string; name: string }>(
      `SELECT id, name FROM public.offices`,
    );

    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /** Mission names, for the designation a line prints. Presentation, not a rule. */
  async missionNames(): Promise<ReadonlyMap<string, string>> {
    const { rows } = await this.#client.query<{ id: string; name: string }>(
      `SELECT id, name FROM public.missions`,
    );

    return new Map(rows.map((row) => [row.id, row.name]));
  }

  /** The dated manager attachment: March's Cra is validated by March's manager (ADR-0034). */
  async hierarchy(): Promise<Hierarchy> {
    const { rows } = await this.#client.query<AttachmentRow>(
      `SELECT consultant_id, manager_id, from_date, to_date FROM public.manager_attachments`,
    );

    return hierarchy(
      rows.map((row) => ({
        consultantId: row.consultant_id,
        managerId: row.manager_id,
        ...bounds(row.from_date, row.to_date),
      })),
    );
  }
}

function toClient(row: ClientRow): Client {
  return makeClient({
    id: row.id,
    name: row.name,
    siren: row.siren,
    intraCommunityVatNumber: row.intra_community_vat_number,
    territoriality: row.territoriality as Territoriality,
    billingAddress: {
      line1: row.billing_address_street,
      line2: null,
      postalCode: row.billing_address_postal_code,
      city: row.billing_address_city,
      country: row.billing_address_country,
    },
    deliveryAddress:
      row.delivery_address_street === null
        ? null
        : {
            line1: row.delivery_address_street,
            line2: null,
            postalCode: row.delivery_address_postal_code ?? '',
            city: row.delivery_address_city ?? '',
            country: row.delivery_address_country ?? '',
          },
  });
}
