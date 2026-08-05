import { describe, expect, it, vi } from 'vitest';

import { runTrackedDataSync } from '../scheduler';

function createProviderRunDb() {
  const run = vi.fn().mockResolvedValue(undefined);
  const bind = vi.fn().mockReturnValue({ run });
  const prepare = vi.fn().mockReturnValue({ bind });
  return {
    database: { prepare } as unknown as D1Database,
    bind,
  };
}

describe('scheduler tracked data sync', () => {
  it('logs zero-row syncs as failed', async () => {
    const { database, bind } = createProviderRunDb();

    await runTrackedDataSync(database, 'index_valuation', async () => ({
      records: 0,
      warning: 'No valuation rows returned',
    }));

    expect(bind).toHaveBeenCalledTimes(1);
    const args = bind.mock.calls[0];
    expect(args[0]).toBe('index_valuation');
    expect(args[4]).toBe('failed');
    expect(args[6]).toBe(0);
    expect(args[7]).toBe('No valuation rows returned');
  });

  it('logs non-empty warning syncs as partial success', async () => {
    const { database, bind } = createProviderRunDb();

    await runTrackedDataSync(database, 'industry_fund_flow', async () => ({
      records: 10,
      warning: 'Failed boards: BK001',
    }));

    const args = bind.mock.calls[0];
    expect(args[4]).toBe('partial_success');
    expect(args[6]).toBe(10);
    expect(args[7]).toBe('Failed boards: BK001');
  });
});
