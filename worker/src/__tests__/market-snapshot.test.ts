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

  it('falls back to individual requests when the batch endpoint fails', async () => {
    const core = SNAPSHOT_MARKET_INSTRUMENTS.slice(0, 5);
    const batchError = new Error('502 Bad Gateway');
    const individualRows = core.map((instrument, index) => ({
      f2: 20000 + index,
      f3: index,
      f6: 100000000,
      f8: 100,
      f12: instrument.code,
      f14: instrument.name,
      f104: instrument.code === '000001' ? 2400 : null,
      f105: instrument.code === '000001' ? 1900 : null,
      f106: instrument.code === '000001' ? 100 : null,
    }));

    getMock
      .mockImplementationOnce(() => ({ json: vi.fn().mockRejectedValue(batchError) }))
      .mockImplementation((url: string) => {
        const instrument = SNAPSHOT_MARKET_INSTRUMENTS.find((item) => url.includes(item.secid));
        const raw = individualRows.find((item) => item.f12 === instrument?.code);
        return { json: vi.fn().mockResolvedValue({ rc: 0, data: { diff: raw ? [raw] : [] } }) };
      });

    const rows = await collectMarketSnapshot();

    expect(rows).toHaveLength(core.length);
    expect(rows.map((row) => row.index_code)).toEqual(core.map((instrument) => instrument.code));
    expect(getMock).toHaveBeenCalledTimes(1 + 5);
  });

  it('does not return rows with missing or invalid prices', async () => {
    const diff = SNAPSHOT_MARKET_INSTRUMENTS.map((instrument, index) => ({
      f2: index === 5 ? null : 10000 + index,
      f3: 0,
      f12: instrument.code,
      f14: instrument.name,
    }));

    jsonMock.mockResolvedValue({ rc: 0, data: { diff } });
    getMock.mockReturnValue({ json: jsonMock });

    const rows = await collectMarketSnapshot();

    expect(rows).toHaveLength(SNAPSHOT_MARKET_INSTRUMENTS.length - 1);
    expect(rows.some((row) => row.index_code === SNAPSHOT_MARKET_INSTRUMENTS[5].code)).toBe(false);
  });

  it('falls back to Tencent historical daily data when core EastMoney requests fail', async () => {
    const core = SNAPSHOT_MARKET_INSTRUMENTS.slice(0, 5);
    getMock
      .mockImplementationOnce(() => ({ json: vi.fn().mockRejectedValue(new Error('502 Bad Gateway')) }))
      .mockImplementation((url: string) => {
        if (url.includes('push2.eastmoney.com')) {
          return { json: vi.fn().mockRejectedValue(new Error('EastMoney unavailable')) };
        }

        const instrument = core.find((item) => url.includes(`${item.secid.startsWith('1.') ? 'sh' : 'sz'}${item.code}`));
        return {
          json: vi.fn().mockResolvedValue({
            code: 0,
            data: {
              [`${instrument?.secid.startsWith('1.') ? 'sh' : 'sz'}${instrument?.code}`]: {
                day: [
                  ['2026-07-30', '100', '100', '101', '99', '1000'],
                  ['2026-07-31', '100', '102', '103', '99', '1100'],
                ],
              },
            },
          }),
        };
      });

    const rows = await collectMarketSnapshot();

    expect(rows).toHaveLength(core.length);
    expect(rows[0]).toMatchObject({
      index_code: '000001',
      trade_date: '2026-07-31',
      close_price: 102,
      change_pct: 2,
      turnover_amount: null,
    });
    expect(getMock).toHaveBeenCalledTimes(1 + core.length + core.length);
  });
});
