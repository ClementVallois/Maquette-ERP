import { describe, expect, it } from 'vitest';

import { useTestTransaction } from './rollback.ts';

describe('test harness', () => {
  const tx = useTestTransaction();

  it('provides a client inside a transaction', async () => {
    const { rows } = await tx.client.query<{ n: number }>('SELECT 1 AS n');
    expect(rows[0]!.n).toBe(1);
  });

  it('rolls back writes between tests', async () => {
    await tx.client.query(
      "INSERT INTO public.offices (id, name, city) VALUES ('harness-test', 'Test', 'Test')",
    );

    const { rows } = await tx.client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM public.offices WHERE id = 'harness-test'",
    );
    expect(Number.parseInt(rows[0]!.count, 10)).toBe(1);
  });

  it('does not see the row from the previous test', async () => {
    const { rows } = await tx.client.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM public.offices WHERE id = 'harness-test'",
    );
    expect(Number.parseInt(rows[0]!.count, 10)).toBe(0);
  });
});
