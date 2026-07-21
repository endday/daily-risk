import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BROAD_MARKET_INDEX_CODES } from '../market-universe';

const { getMock, jsonMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  jsonMock: vi.fn(),
}));

vi.mock('../collectors/http', () => ({
  http: { get: getMock },
}));

import { collectMarketCap } from '../collectors/market-cap';

describe('market cap collector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMock.mockReturnValue({ json: jsonMock });
  });

  it('uses the CSI All Share market cap as the temporary market proxy', async () => {
    jsonMock.mockResolvedValue({
      data: {
        f57: '000985',
        f58: '中证全指',
        f116: 104406931321335.28,
      },
    });

    const rows = await collectMarketCap();

    expect(rows).toHaveLength(BROAD_MARKET_INDEX_CODES.length);
    expect(rows.every((row) => row.total_market_cap === 104.41)).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock.mock.calls[0][0]).toContain('secid=1.000985');
    expect(getMock.mock.calls[0][0]).toContain('fields=f57%2Cf58%2Cf116');
  });

  it('does not write snapshots when the quote identity is wrong', async () => {
    jsonMock.mockResolvedValue({ data: { f57: '000001', f116: 104e12 } });

    await expect(collectMarketCap()).resolves.toEqual([]);
  });

  it('does not write snapshots when total market cap is unavailable', async () => {
    jsonMock.mockResolvedValue({ data: { f57: '000985', f116: '-' } });

    await expect(collectMarketCap()).resolves.toEqual([]);
  });
});
