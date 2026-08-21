import { describe, expect, it } from 'vitest';

import { isRole, ROLES } from './actor.ts';

describe('ROLES', () => {
  it('is the three of ADR-0023, in the order the selector shows them', () => {
    expect(ROLES).toStrictEqual(['consultant', 'manager', 'billing']);
  });

  it('does not contain the HR roles the seed writes on a consultant', () => {
    // `public.consultants.role` is `consultant | manager | director`. The overlap on two of the
    // three words is exactly why ADR-0023 keeps the two vocabularies apart, and `director` is
    // the word that proves they are not the same list.
    expect(ROLES).not.toContain('director');
  });
});

describe('isRole', () => {
  it('accepts each of the three', () => {
    for (const role of ROLES) expect(isRole(role)).toBe(true);
  });

  it('refuses an HR role, a near miss and a non-string', () => {
    for (const candidate of ['director', 'Manager', 'admin', '', null, undefined, 3, ['manager']]) {
      expect(isRole(candidate)).toBe(false);
    }
  });
});
