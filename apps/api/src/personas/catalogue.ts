import { isRole, type Role } from '@erp/platform';
import type { Actor } from '@erp/platform';

import { ApiFailure } from '../errors.ts';

/**
 * The persona catalogue: `public.personas`, joined to the consultant it names and the office that
 * bounds its scope (ADR-0023).
 *
 * Read on every request rather than cached. Reference data written only by the seed would cache
 * safely, and a cache would also be a second place where the truth lives — for one indexed lookup
 * per request, on a demo instance, that is a trade with nothing on the other side. The threshold
 * is the first profiling run that names it.
 */

export interface Persona {
  /** The business reference — what travels in the cookie and what a reader can type. */
  readonly key: string;
  readonly role: Role;
  readonly consultantId: string;
  readonly officeId: string;
  readonly officeName: string;
  /** "Alice Martin". Composed from the consultant, so the persona table stores no display copy. */
  readonly displayName: string;
}

export function actorOf(persona: Persona): Actor {
  return {
    consultantId: persona.consultantId,
    officeId: persona.officeId,
    role: persona.role,
  };
}

/** Just the slice of `pg` this reads. Concrete in `PersonaRow` rather than generic: the catalogue
 * runs one query shape, and a type parameter used once is a cast wearing a costume. */
interface PgClient {
  query(text: string, values?: unknown[]): Promise<{ rows: PersonaRow[] }>;
}

interface PersonaRow {
  key: string;
  role: string;
  consultant_id: string;
  office_id: string;
  office_name: string;
  first_name: string;
  last_name: string;
}

const SELECT = `
  SELECT p.key, p.role, p.consultant_id, c.office_id, o.name AS office_name,
         c.first_name, c.last_name
  FROM public.personas p
  JOIN public.consultants c ON c.id = p.consultant_id
  JOIN public.offices o ON o.id = c.office_id`;

export interface PersonaCatalogue {
  list(): Promise<readonly Persona[]>;
  byKey(key: string): Promise<Persona | null>;
}

export class PgPersonaCatalogue implements PersonaCatalogue {
  readonly #client: PgClient;

  constructor(client: PgClient) {
    this.#client = client;
  }

  async list(): Promise<readonly Persona[]> {
    const { rows } = await this.#client.query(`${SELECT} ORDER BY p.display_order`);

    return rows.map(toPersona);
  }

  async byKey(key: string): Promise<Persona | null> {
    const { rows } = await this.#client.query(`${SELECT} WHERE p.key = $1`, [key]);
    const row = rows[0];

    return row === undefined ? null : toPersona(row);
  }
}

function toPersona(row: PersonaRow): Persona {
  if (!isRole(row.role)) {
    // The column has a CHECK constraint naming the same three values, so reaching this means the
    // constraint and `ROLES` have drifted apart — a deployment fault, not a request fault.
    throw new ApiFailure(`public.personas.role holds a value that is not a Role: ${row.role}`);
  }

  return {
    key: row.key,
    role: row.role,
    consultantId: row.consultant_id,
    officeId: row.office_id,
    officeName: row.office_name,
    displayName: `${row.first_name} ${row.last_name}`,
  };
}
