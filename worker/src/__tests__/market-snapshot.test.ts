import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SNAPSHOT_MARKET_INSTRUMENTS } from '../market-universe';

const { getMock, jsonMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  jsonMock: vi.fn(),
}));

vi.mock('../collectors/http', () => ({
  http: {
    get: getMock,
  },
}));

import { collectMarketSnapshot } from '../collectors/market-snapshot';

describe('collectMarketSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collects the configured snapshot instrument whitelist in order', async () => {
    const diff = SNAPSHOT_MARKET_INSTRUMENTS.map((instrument, index) => ({
      f2: 10000 + index,
      f3: index * 10,
      f6: 100000000 + index,
      f8: 200 + index,
      f104: instrument.code === '000001' ? 2500 : null,
      f105: instrument.code === '000001' ? 1800 : null,
      f106: instrument.code === '000001' ? 200 : null,
      f12: instrument.code,
      f14: instrument.name,
    }));

    jsonMock.mockResolvedValue({ rc: 0, data: { diff } });
    getMock.mockReturnValue({ json: jsonMock });

    const rows = await collectMarketSnapshot();

    expect(rows).toHaveLength(SNAPSHOT_MARKET_INSTRUMENTS.length);
    expect(rows.map((row) => row.index_code)).toEqual(
      SNAPSHOT_MARKET_INSTRUMENTS.map((instrument) => instrument.code),
    );

    expect(rows[0]).toMatchObject({
      index_code: '000001',
      close_price: 100,
      change_pct: 0,
      rise_count: 2500,
      fall_count: 1800,
      flat_count: 200,
    });

    expect(rows[rows.length - 1]).toMatchObject({
      index_code: '515790',
      rise_count: null,
      fall_count: null,
      flat_count: null,
    });

    expect(getMock).toHaveBeenCalledTimes(1);
  });
});
