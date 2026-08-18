import { InvalidValueError } from '@erp/platform';
import { describe, expect, it } from 'vitest';

import { client, isValidSiren } from './client.ts';
import { billingReference, commercialMission } from './reference.ts';
import {
  parisClient,
  PARIS_CLIENT,
  REGIE_MISSION,
  reference,
  reunionClient,
} from './testing/march-2026.ts';

describe('a client', () => {
  it('is reduced to what issuing an invoice to it needs', () => {
    expect(parisClient.siren).toBe('552100554');
    expect(parisClient.territoriality).toBe('metropolitanFrance');
    expect(parisClient.intraCommunityVatNumber).toBeNull();
  });

  it('falls back to the billing address when no delivery address is stated', () => {
    expect(parisClient.deliveryAddress).toBeNull();
  });

  it('refuses a SIREN whose check digit does not hold', () => {
    // 552100555 is 552100554 with the last digit moved by one: nine digits, right shape, and not
    // a SIREN. A length check alone accepts it, which is the whole reason for the Luhn key.
    expect(isValidSiren('552100554')).toBe(true);
    expect(isValidSiren('552100555')).toBe(false);
    expect(isValidSiren('55210055')).toBe(false);
    expect(isValidSiren('55210055A')).toBe(false);
  });

  it('refuses a SIREN that does not pass the check, wherever the client is', () => {
    expect(() =>
      client({
        id: 'x',
        name: 'Banque Nord SA',
        siren: '552100555',
        territoriality: 'metropolitanFrance',
        billingAddress: parisClient.billingAddress,
      }),
    ).toThrow(InvalidValueError);
  });

  it('refuses a French client with no SIREN', () => {
    expect(() =>
      client({
        id: 'x',
        name: 'Sans SIREN SARL',
        territoriality: 'metropolitanFrance',
        billingAddress: parisClient.billingAddress,
      }),
    ).toThrow(InvalidValueError);
  });

  it('refuses an intra-EU VAT number that is not one', () => {
    expect(() =>
      client({
        id: 'x',
        name: 'Kunde GmbH',
        intraCommunityVatNumber: '123456789',
        territoriality: 'europeanUnion',
        billingAddress: parisClient.billingAddress,
      }),
    ).toThrow(InvalidValueError);
  });

  it('refuses a client with no name', () => {
    expect(() =>
      client({
        id: 'x',
        name: '  ',
        siren: '552100554',
        territoriality: 'metropolitanFrance',
        billingAddress: parisClient.billingAddress,
      }),
    ).toThrow(InvalidValueError);
  });

  it('accepts an EU client with no SIREN', () => {
    const kunde = client({
      id: 'client-de',
      name: 'Kunde GmbH',
      intraCommunityVatNumber: 'DE811569869',
      territoriality: 'europeanUnion',
      billingAddress: { ...parisClient.billingAddress, country: 'DE' },
    });

    expect(kunde.siren).toBeNull();
  });
});

describe('what billing knows about a mission', () => {
  it('holds the commercial terms, and nothing about staffing', () => {
    const mission = reference.mission(REGIE_MISSION);

    expect(mission?.billingModel).toBe('Regie');
    expect(mission?.clientId).toBe(PARIS_CLIENT);
  });

  it('answers the rate that was in force on a day, not the current one', () => {
    // The renegotiation of 1 March 2026. Work done in February bills at February's rate.
    expect(reference.tjmCentsOn(REGIE_MISSION, '2026-02-27')).toBe(62_000);
    expect(reference.tjmCentsOn(REGIE_MISSION, '2026-03-31')).toBe(65_000);
  });

  it('answers nothing for a mission it does not hold, and for a day before any rate', () => {
    expect(reference.mission('mission-unknown')).toBeNull();
    expect(reference.tjmCentsOn('mission-unknown', '2026-03-31')).toBeNull();
    expect(reference.tjmCentsOn(REGIE_MISSION, '2024-01-01')).toBeNull();
  });

  it('answers nothing for a client it does not hold', () => {
    expect(reference.client('client-unknown')).toBeNull();
    expect(reference.client(reunionClient.id)?.territoriality).toBe('overseasWithVat');
  });

  it('refuses a daily rate that is not an even number of cents above zero', () => {
    // Checked where the rate enters rather than where it is divided: a Tjm is a whole number of
    // euros, and a reference row that is not one would only fail later, on one line of one invoice.
    const build = (value: number): unknown =>
      commercialMission({
        id: 'm',
        clientId: PARIS_CLIENT,
        billingModel: 'Regie',
        tjmCents: [{ from: '2025-01-01', to: null, value }],
      });

    expect(() => build(65_001)).toThrow(InvalidValueError);
    expect(() => build(0)).toThrow(InvalidValueError);
    expect(() => build(-65_000)).toThrow(InvalidValueError);
  });

  it('refuses two rates in force on the same day', () => {
    // The kernel's timeline holds this, and the test is here because a mission with two rates on
    // one day is the shape a bad seed produces, not a shape a test of `timeline` would name.
    expect(() =>
      commercialMission({
        id: 'm',
        clientId: PARIS_CLIENT,
        billingModel: 'Regie',
        tjmCents: [
          { from: '2025-01-01', to: null, value: 62_000 },
          { from: '2026-03-01', to: null, value: 65_000 },
        ],
      }),
    ).toThrow(InvalidValueError);
  });

  it('is empty when it is handed nothing', () => {
    const empty = billingReference({ missions: [], clients: [] });

    expect(empty.mission(REGIE_MISSION)).toBeNull();
  });
});
