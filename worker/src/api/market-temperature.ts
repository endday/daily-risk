import * as db from '../db';
import type { Env } from '../env';
import type { InstrumentDailyRow } from '../collectors/base';
import type { ChinaGdpData, MarketSnapshotRowLike, TemperatureDerived } from '../../../shared/types';

function formatSnapshotForAPI(row: MarketSnapshotRowLike): MarketSnapshotRowLike {
  return {
    trade_date: row.trade_date,
    index_code: row.index_code,
    close_price: row.close_price,
    change_pct: row.change_pct,
    rise_count: row.rise_count,
    fall_count: row.fall_count,
    flat_count: row.flat_count,
    turnover_amount: row.turnover_amount,
    turnover_rate: row.turnover_rate,
    volatility_20d: row.volatility_20d,
    northbound_amt: row.northbound_amt,
    pe_ttm: row.pe_ttm,
    pb: row.pb,
    margin_balance: row.margin_balance,
    bond_yield_10y: row.bond_yield_10y,
    us_2y_yield: row.us_2y_yield,
    fed_funds_rate: row.fed_funds_rate,
    usd_index: row.usd_index,
    oil_wti: row.oil_wti,
    us_yield_spread: row.us_yield_spread,
    total_market_cap: row.total_market_cap,
  };
}

function formatInstrumentDailyForAPI(row: InstrumentDailyRow): MarketSnapshotRowLike {
  return {
    trade_date: row.trade_date,
    index_code: row.instrument_code,
    close_price: row.close_price,
    change_pct: row.change_pct,
    rise_count: null,
    fall_count: null,
    flat_count: null,
    turnover_amount: row.amount,
    turnover_rate: row.turnover_rate,
    volatility_20d: null,
    northbound_amt: null,
    pe_ttm: row.pe_ttm,
    pb: row.pb,
    margin_balance: null,
    bond_yield_10y: null,
    us_2y_yield: null,
    fed_funds_rate: null,
    usd_index: null,
    oil_wti: null,
    us_yield_spread: null,
    total_market_cap: row.total_market_cap,
  };
}

/**
 * 获取最近一年的中国名义 GDP（万亿元人民币）
 * 从 china-gdp.json 读取，按年份降序取最新的非零值
 */
function getLatestChinaGDP(chinaGdpData: ChinaGdpData): number | null {
  const data = chinaGdpData.data;
  if (!data) return null;

  const years = Object.keys(data).map(Number).sort((a, b) => b - a);
  for (const year of years) {
    const value = data[year];
    if (value > 0) return value;
  }

  return null;
}

type SnapshotMetricKey = 'turnover_amount' | 'northbound_amt' | 'usd_index';

function avgField(rows: MarketSnapshotRowLike[], field: SnapshotMetricKey): number | null {
  const values = rows.map((row) => row[field]).filter((value): value is number => value != null);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function createEmptyDerived(): TemperatureDerived {
  return {
    advance_decline_ratio: null,
    advance_decline_label: null,
    turnover_5d_avg: null,
    turnover_20d_avg: null,
    turnover_trend: null,
    northbound_5d_avg: null,
    northbound_20d_avg: null,
    northbound_trend: null,
    volatility_label: null,
    margin_balance_yi: null,
    pe_ttm: null,
    pe_percentile: null,
    pe_label: null,
    erp: null,
    erp_label: null,
    total_market_cap: null,
    buffett_ratio: null,
    buffett_label: null,
    us_2y_yield: null,
    fed_funds_rate: null,
    usd_index: null,
    usd_trend: null,
    oil_wti: null,
    us_yield_spread: null,
    yield_curve_label: null,
  };
}

function sampleHistoryRows<T>(rows: T[], maxPoints: number): { rows: T[]; sampled: boolean; sampleStep: number } {
  if (maxPoints <= 0 || rows.length <= maxPoints) {
    return { rows, sampled: false, sampleStep: 1 };
  }

  const sampleStep = Math.max(1, Math.ceil(rows.length / maxPoints));
  const sampledRows = rows.filter((_, index) => index % sampleStep === 0);
  const lastRow = rows[rows.length - 1];

  if (sampledRows[sampledRows.length - 1] !== lastRow) {
    sampledRows.push(lastRow);
  }

  return { rows: sampledRows, sampled: true, sampleStep };
}

function computeDerivedMetrics(
  history: MarketSnapshotRowLike[],
  hs300History: MarketSnapshotRowLike[],
  latest300: MarketSnapshotRowLike | undefined,
  chinaGdpData: ChinaGdpData,
): TemperatureDerived {
  const latest = history[0];
  const result = createEmptyDerived();

  if (!latest) return result;

  if (latest.rise_count != null && latest.fall_count != null) {
    const total = latest.rise_count + latest.fall_count;
    result.advance_decline_ratio = total > 0
      ? Math.round(latest.rise_count / total * 1000) / 10
      : null;
    result.advance_decline_label =
      result.advance_decline_ratio >= 60 ? '赚钱效应强' :
      result.advance_decline_ratio >= 45 ? '涨跌互现' :
      '亏钱效应明显';
  }

  const turnover5 = avgField(history.slice(0, 5), 'turnover_amount');
  const turnover20 = avgField(history.slice(0, 20), 'turnover_amount');
  if (turnover5 && turnover20 && turnover20 > 0) {
    result.turnover_5d_avg = Math.round(turnover5 / 1e8);
    result.turnover_20d_avg = Math.round(turnover20 / 1e8);
    result.turnover_trend = turnover5 > turnover20 * 1.1 ? '放量' :
      turnover5 < turnover20 * 0.9 ? '缩量' : '平稳';
  }

  const nb5 = avgField(hs300History.slice(0, 5), 'northbound_amt');
  const nb20 = avgField(hs300History.slice(0, 20), 'northbound_amt');
  if (nb5 && nb20 && nb20 > 0) {
    result.northbound_5d_avg = Math.round(nb5 / 10000);
    result.northbound_20d_avg = Math.round(nb20 / 10000);
    result.northbound_trend = nb5 > nb20 * 1.2 ? '外资放量' :
      nb5 < nb20 * 0.8 ? '外资缩量' : '外资平稳';
  }

  if (latest.volatility_20d != null) {
    result.volatility_label =
      latest.volatility_20d > 25 ? '高波动' :
      latest.volatility_20d > 15 ? '正常波动' : '低波动';
  }

  if (latest.margin_balance != null) {
    result.margin_balance_yi = Math.round(latest.margin_balance);
  }

  const pe = latest300?.pe_ttm;
  const bondYield = latest300?.bond_yield_10y;

  if (pe != null && pe > 0) {
    result.pe_ttm = pe;

    const peValues = hs300History
      .map((item) => item.pe_ttm)
      .filter((value): value is number => value != null && value > 0)
      .sort((a, b) => a - b);

    if (peValues.length >= 5) {
      const rank = peValues.filter((value) => value <= pe).length;
      result.pe_percentile = Math.round(rank / peValues.length * 100);
      result.pe_label =
        result.pe_percentile <= 20 ? '极低估' :
        result.pe_percentile <= 40 ? '偏低估' :
        result.pe_percentile <= 60 ? '合理' :
        result.pe_percentile <= 80 ? '偏高估' : '极度高估';
    }
  }

  if (pe != null && pe > 0 && bondYield != null) {
    const earningsYield = 1 / pe * 100;
    result.erp = Math.round((earningsYield - bondYield) * 100) / 100;
    result.erp_label =
      result.erp > 8 ? '股票极便宜' :
      result.erp > 5 ? '股票偏低估' :
      result.erp > 2 ? '合理' :
      result.erp > 0 ? '偏高估' : '极度高估';
  }

  const totalMarketCap = latest?.total_market_cap;
  if (totalMarketCap != null && totalMarketCap > 0) {
    result.total_market_cap = totalMarketCap;
    const gdp = getLatestChinaGDP(chinaGdpData);
    if (gdp != null && gdp > 0) {
      const ratio = totalMarketCap / gdp;
      result.buffett_ratio = Math.round(ratio * 100) / 100;
      result.buffett_label =
        ratio < 0.5 ? '极度低估' :
        ratio < 0.7 ? '偏低估' :
        ratio < 0.9 ? '合理' :
        ratio < 1.1 ? '偏高估' : '极度高估';
    }
  }

  if (latest?.us_2y_yield != null) result.us_2y_yield = latest.us_2y_yield;
  if (latest?.fed_funds_rate != null) result.fed_funds_rate = latest.fed_funds_rate;
  if (latest?.usd_index != null) {
    result.usd_index = latest.usd_index;
    const usd5 = avgField(history.slice(0, 5), 'usd_index');
    if (usd5 != null) {
      result.usd_trend = latest.usd_index > usd5 * 1.01 ? '美元走强' :
        latest.usd_index < usd5 * 0.99 ? '美元走弱' : '美元平稳';
    }
  }
  if (latest?.oil_wti != null) result.oil_wti = latest.oil_wti;
  if (latest?.us_yield_spread != null) {
    result.us_yield_spread = latest.us_yield_spread;
    result.yield_curve_label =
      latest.us_yield_spread < 0 ? '倒挂（衰退预警）' :
      latest.us_yield_spread < 0.5 ? '偏平' : '正常';
  }

  return result;
}

export async function handleMarketTemperature(
  request: Request,
  env: Env,
  headers: Record<string, string>,
  chinaGdpData: ChinaGdpData,
): Promise<Response> {
  const url = new URL(request.url);
  const daysParam = url.searchParams.get('days') || '20';
  const compact = url.searchParams.get('compact') === '1';
  const indexCode = url.searchParams.get('indexCode') || '000300';
  const maxPointsParam = parseInt(url.searchParams.get('maxPoints') || '', 10);
  const maxPoints = Number.isFinite(maxPointsParam) ? Math.max(60, Math.min(maxPointsParam, 1200)) : null;
  const maxDays = compact ? 3650 : 365;
  const parsedDays = Number(daysParam);
  const days = Number.isInteger(parsedDays) && parsedDays > 0
    ? Math.min(parsedDays, maxDays)
    : 20;

  try {
    const latest = await db.getLatestSnapshots(env.DB);
    if (latest.length === 0) {
      return new Response(JSON.stringify({
        error: 'No market temperature data available yet. Run /admin/collect first.',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }

    const latestDate = latest[0].trade_date;
    const startDate = new Date(latestDate + 'T00:00:00Z');
    startDate.setDate(startDate.getDate() - days);
    const startDateStr = startDate.toISOString().split('T')[0];

    let rawHistory: MarketSnapshotRowLike[];
    if (compact) {
      let instrumentHistory: InstrumentDailyRow[] = [];
      try {
        instrumentHistory = await db.getInstrumentDailyByDateRange(
          env.DB,
          indexCode,
          startDateStr,
          latestDate,
        );
      } catch (error) {
        console.warn('[MarketTemp] instrument_daily unavailable, falling back to market_snapshots:', error);
      }
      const snapshotHistory = await db.getSnapshotsByDateRangeAndIndex(
        env.DB,
        indexCode,
        startDateStr,
        latestDate,
      );

      if (instrumentHistory.length > 0) {
        const snapshotsByDate = new Map(
          snapshotHistory.map((row) => [row.trade_date, formatSnapshotForAPI(row)]),
        );
        rawHistory = instrumentHistory.map((row) => {
          const instrument = formatInstrumentDailyForAPI(row);
          const snapshot = snapshotsByDate.get(row.trade_date);
          return {
            ...snapshot,
            ...instrument,
            pe_ttm: instrument.pe_ttm ?? snapshot?.pe_ttm ?? null,
            pb: instrument.pb ?? snapshot?.pb ?? null,
            bond_yield_10y: snapshot?.bond_yield_10y ?? null,
            us_2y_yield: snapshot?.us_2y_yield ?? null,
            fed_funds_rate: snapshot?.fed_funds_rate ?? null,
            usd_index: snapshot?.usd_index ?? null,
            oil_wti: snapshot?.oil_wti ?? null,
            us_yield_spread: snapshot?.us_yield_spread ?? null,
          };
        });
      } else {
        rawHistory = snapshotHistory;
      }
    } else {
      rawHistory = await db.getSnapshotsByDateRange(env.DB, startDateStr, latestDate);
    }
    const sampledHistory = compact && maxPoints
      ? sampleHistoryRows(rawHistory, maxPoints)
      : { rows: rawHistory, sampled: false, sampleStep: 1 };
    const history = sampledHistory.rows;
    const historyByIndex: Record<string, typeof history> = {};
    for (const row of history) {
      if (!historyByIndex[row.index_code]) historyByIndex[row.index_code] = [];
      historyByIndex[row.index_code].push(row);
    }

    const shHistory = historyByIndex['000001'] || [];
    const hs300History = historyByIndex['000300'] || [];
    const latest300Snapshot = latest.find((row) => row.index_code === '000300') || latest[0];
    const latest300 = {
      ...(hs300History[0] || {}),
      ...latest300Snapshot,
    } as MarketSnapshotRowLike;
    const primaryHistory = compact
      ? historyByIndex[indexCode] || history
      : shHistory;
    const derived = computeDerivedMetrics(primaryHistory, hs300History, latest300, chinaGdpData);
    const latestPayload = compact
      ? latest.filter((row) => row.index_code === indexCode)
      : latest;

    return new Response(JSON.stringify({
      trade_date: latestDate,
      latest: latestPayload.map(formatSnapshotForAPI),
      derived,
      history: history.map(formatSnapshotForAPI),
      history_days: days,
      ...(compact ? {
        compact: true,
        index_code: indexCode,
        sampled: sampledHistory.sampled,
        sample_step: sampledHistory.sampleStep,
      } : {}),
    }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60', ...headers },
    });
  } catch (error) {
    console.error('[MarketTemp] Error:', error);

    const message = error instanceof Error ? error.message : String(error);
    const isSchemaIssue =
      /no such table/i.test(message) ||
      /no such column/i.test(message) ||
      /database is locked/i.test(message);

    if (isSchemaIssue) {
      return new Response(JSON.stringify({
        error: 'Market temperature data store is not ready',
        detail: 'Local D1 schema is incomplete or locked. Apply local migrations and ensure market_snapshots exists.',
      }), {
        status: 503,
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }

    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...headers },
    });
  }
}
