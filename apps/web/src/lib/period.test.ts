import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentPeriod } from './period.ts';

describe('currentPeriod', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the wall-clock month, zero-padded', () => {
    vi.setSystemTime(new Date(2026, 0, 15)); // January — the month index most likely to leak unpadded

    expect(currentPeriod()).toBe('2026-01');
  });

  it('reads December without rolling into the next year', () => {
    vi.setSystemTime(new Date(2026, 11, 31));

    expect(currentPeriod()).toBe('2026-12');
  });
});
