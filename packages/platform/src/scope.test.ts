import { describe, expect, it } from 'vitest';

import type { Actor } from './actor.ts';
import { ROLES } from './actor.ts';
import { assertMayRead, OutOfScopeError, readScope, RESOURCES } from './scope.ts';

const PARIS = 'office-paris';
const LYON = 'office-lyon';

const actor = (role: Actor['role'], officeId = PARIS, consultantId = 'alice'): Actor => ({
  consultantId,
  officeId,
  role,
});

const parisCraOfAlice = { officeId: PARIS, subjectId: 'alice' };
const parisCraOfClaire = { officeId: PARIS, subjectId: 'claire' };
const lyonCraOfDavid = { officeId: LYON, subjectId: 'david' };
const parisInvoice = { officeId: PARIS, subjectId: null };
const lyonInvoice = { officeId: LYON, subjectId: null };

describe('the read-scope matrix', () => {
  it('answers for every role and every resource', () => {
    // A missing cell would read `undefined`, which is falsy and would be treated as no scope by
    // some callers and as a scope by others. The matrix is total or it is not a matrix.
    for (const role of ROLES) {
      for (const resource of RESOURCES) {
        expect(['none', 'own', 'office']).toContain(readScope(actor(role), resource));
      }
    }
  });

  it('gives a consultant their own CRA and nothing else at all', () => {
    expect(readScope(actor('consultant'), 'cra')).toBe('own');
    expect(readScope(actor('consultant'), 'invoice')).toBe('none');
    expect(readScope(actor('consultant'), 'economics')).toBe('none');
  });

  it('gives billing the CRA behind the line, and never the margin', () => {
    expect(readScope(actor('billing'), 'cra')).toBe('office');
    expect(readScope(actor('billing'), 'invoice')).toBe('office');
    expect(readScope(actor('billing'), 'economics')).toBe('none');
  });

  it('gives the manager the office on all three, and only the manager', () => {
    for (const resource of RESOURCES) {
      expect(readScope(actor('manager'), resource)).toBe('office');
    }
    const others = ROLES.filter((role) => role !== 'manager');
    for (const role of others) {
      expect(readScope(actor(role), 'economics')).toBe('none');
    }
  });
});

describe('assertMayRead', () => {
  it('lets a manager read a CRA of their own office, whoever it is about', () => {
    expect(() => {
      assertMayRead(actor('manager', PARIS, 'bruno'), 'cra', parisCraOfClaire);
    }).not.toThrow();
  });

  it('refuses a manager the same record in another office', () => {
    // ADR-0003's claim, at the point that enforces it: a manager in one office cannot reach
    // another office's record, and the refusal is typed rather than an absence.
    expect(() => {
      assertMayRead(actor('manager', LYON, 'emma'), 'cra', parisCraOfClaire);
    }).toThrow(OutOfScopeError);
  });

  it('lets a consultant read their own CRA', () => {
    expect(() => {
      assertMayRead(actor('consultant', PARIS, 'alice'), 'cra', parisCraOfAlice);
    }).not.toThrow();
  });

  it("refuses a consultant a colleague's CRA in their own office", () => {
    // The role dimension, which office scope alone does not catch: same office, different person.
    expect(() => {
      assertMayRead(actor('consultant', PARIS, 'alice'), 'cra', parisCraOfClaire);
    }).toThrow(OutOfScopeError);
  });

  it('refuses a consultant an invoice, in their own office, about their own days', () => {
    expect(() => {
      assertMayRead(actor('consultant', PARIS, 'alice'), 'invoice', parisInvoice);
    }).toThrow(OutOfScopeError);
  });

  it('refuses billing the economics of its own office', () => {
    expect(() => {
      assertMayRead(actor('billing', PARIS, 'henri'), 'economics', parisInvoice);
    }).toThrow(OutOfScopeError);
  });

  it('lets billing read an invoice of its office and refuses another office', () => {
    expect(() => {
      assertMayRead(actor('billing', PARIS, 'henri'), 'invoice', parisInvoice);
    }).not.toThrow();
    expect(() => {
      assertMayRead(actor('billing', PARIS, 'henri'), 'invoice', lyonInvoice);
    }).toThrow(OutOfScopeError);
  });

  it('refuses a consultant a CRA that is theirs but in another office', () => {
    // Both dimensions are checked, not whichever one happens to be looked at first.
    expect(() => {
      assertMayRead(actor('consultant', PARIS, 'david'), 'cra', lyonCraOfDavid);
    }).toThrow(OutOfScopeError);
  });
});

describe('the refusal itself', () => {
  it('carries the problem type the wire maps to 403', () => {
    expect(new OutOfScopeError('cra').problemType).toBe('/problems/out-of-scope');
  });

  it('publishes no field describing what it refused', () => {
    // ADR-0042: a 403 names the rule and nothing about the record. Details here would say which
    // office holds it and who it is about, which is what the refusal exists to withhold.
    const refusal = new OutOfScopeError('economics');

    expect(refusal.details).toStrictEqual({});
    expect(refusal.message).not.toContain('office-');
  });
});
