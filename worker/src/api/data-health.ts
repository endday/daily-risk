import * as db from '../db';
import type { Env } from '../env';
import { isTradingDay } from '../trading-calendar';
import { VALUATION_INDICES } from '../valuation-universe';
import { offsetDate } from '../../../shared/date-utils';
import type {
  DataHealthCollector,
  DataHealthDataset,
  DataHealthResponse,
  DataHealthState,
} from '../../../shared/types';

const MAX_LOOKBACK_DAYS = 21;
const DAILY_SYNC_CUTOFF_BEIJING_HOUR = 18;

async function getLatestTradingDate(database: D1Database, now: string): Promise<string> {
  for (let offset = 0; offset <= MAX_LOOKBACK_DAYS; offset++) {
    const date = offsetDate(now, -offset);
    if (await isTradingDay(database, date)) return date;
  }
  throw new Error(`No trading day found in the ${MAX_LOOKBACK_DAYS}-day lookback window`);
}

function getLatestCompletedMarketAnchor(now: Date): string {
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const today = `${beijing.getUTCFullYear()}-${String(beijing.getUTCMonth() + 1).padStart(2, '0')}-${String(beijing.getUTCDate()).padStart(2, '0')}`;
  return beijing.getUTCHours() < DAILY_SYNC_CUTOFF_BEIJING_HOUR
    ? offsetDate(today, -1)
    : today;
}

export async function getExpectedLatestTradingDate(
  database: D1Database,
  now: Date = new Date(),
): Promise<string> {
  return getLatestTradingDate(database, getLatestCompletedMarketAnchor(now));
}

async function countTradingDaysBehind(
  database: D1Database,
  latestTradeDate: string | null,
  expectedTradeDate: string,
): Promise<number | null> {
  if (latestTradeDate == null) return null;
  if (latestTradeDate >= expectedTradeDate) return 0;

  let count = 0;
  for (let offset = 1; offset <= MAX_LOOKBACK_DAYS; offset++) {
    const date = offsetDate(expectedTradeDate, -offset + 1);
    if (date <= latestTradeDate) break;
    if (await isTradingDay(database, date)) count++;
  }
  return count;
}

function datasetState(
  recordCount: number,
  tradingDaysBehind: number | null,
  latestRunStatus: string | null,
  expectedSeriesCount?: number,
  availableSeriesCount?: number,
): DataHealthState {
  if (recordCount === 0) return 'unavailable';
  if (tradingDaysBehind != null && tradingDaysBehind > 2) return 'stale';
  if (expectedSeriesCount != null && availableSeriesCount != null && availableSeriesCount < expectedSeriesCount) {
    return 'partial';
  }
  if (latestRunStatus === 'partial_success') return 'partial';
  // A failed run with current coverage means the data is usable but the
  // automatic refresh path needs attention; keep the failure details below.
  if (latestRunStatus === 'failed') return tradingDaysBehind === 0 ? 'partial' : 'stale';
  return 'healthy';
}

export async function handleDataHealth(
  _request: Request,
  env: Env,
  headers: Record<string, string>,
): Promise<Response> {
  try {
    const expectedLatestTradingDate = await getExpectedLatestTradingDate(env.DB);
    const [marketSnapshot, valuation, industryFlow, marketSentiment, providerRuns] = await Promise.all([
      db.getMarketSnapshotCoverage(env.DB),
      db.getInstrumentValuationCoverage(env.DB, VALUATION_INDICES.map((index) => index.code)),
      db.getIndustryFundFlowCoverage(env.DB),
      db.getMarketSentimentCoverage(env.DB).catch(() => ({
        record_count: 0,
        series_count: 0,
        min_trade_date: null,
        max_trade_date: null,
        source_updated_at: null,
      })),
      db.getProviderRunHealth(env.DB),
    ]);
    const runsByProvider = new Map(providerRuns.map((run) => [run.provider, run]));
    const marketSnapshotRun = runsByProvider.get('market_snapshot');
    const valuationRun = runsByProvider.get('index_valuation');
    const industryFlowRun = runsByProvider.get('industry_fund_flow');
    const marketSentimentRun = runsByProvider.get('market_sentiment');
    const [marketSnapshotLag, valuationLag, industryFlowLag, marketSentimentLag] = await Promise.all([
      countTradingDaysBehind(env.DB, marketSnapshot.max_trade_date, expectedLatestTradingDate),
      countTradingDaysBehind(env.DB, valuation.max_trade_date, expectedLatestTradingDate),
      countTradingDaysBehind(env.DB, industryFlow.max_trade_date, expectedLatestTradingDate),
      countTradingDaysBehind(env.DB, marketSentiment.max_trade_date, expectedLatestTradingDate),
    ]);
    const datasets: DataHealthDataset[] = [
      {
        key: 'market_snapshot',
        label: '市场行情快照',
        source: '东方财富 push2 / 腾讯历史日线备用',
        source_url: 'https://push2.eastmoney.com/api/qt/ulist.np/get',
        state: datasetState(marketSnapshot.record_count, marketSnapshotLag, marketSnapshotRun?.status ?? null),
        record_count: marketSnapshot.record_count,
        min_trade_date: marketSnapshot.min_trade_date,
        latest_trade_date: marketSnapshot.max_trade_date,
        source_updated_at: marketSnapshot.source_updated_at,
        trading_days_behind: marketSnapshotLag,
        last_run_status: marketSnapshotRun?.status ?? null,
        last_success_at: marketSnapshotRun?.last_success_at ?? null,
        last_records_upserted: marketSnapshotRun?.records_upserted ?? null,
        error: marketSnapshotRun?.error ?? null,
      },
      {
        key: 'index_valuation',
        label: '指数估值',
        source: '中证指数 index-perf',
        source_url: 'https://www.csindex.com.cn/csindex-home/perf/index-perf',
        state: datasetState(
          valuation.record_count,
          valuationLag,
          valuationRun?.status ?? null,
          VALUATION_INDICES.length,
          valuation.series_count,
        ),
        record_count: valuation.record_count,
        min_trade_date: valuation.min_trade_date,
        latest_trade_date: valuation.max_trade_date,
        source_updated_at: valuation.source_updated_at,
        trading_days_behind: valuationLag,
        expected_series_count: VALUATION_INDICES.length,
        available_series_count: valuation.series_count,
        last_run_status: valuationRun?.status ?? null,
        last_success_at: valuationRun?.last_success_at ?? null,
        last_records_upserted: valuationRun?.records_upserted ?? null,
        error: valuationRun?.error ?? null,
      },
      {
        key: 'industry_fund_flow',
        label: '行业资金流',
        source: '东方财富行业主力资金流',
        source_url: 'https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get',
        state: datasetState(industryFlow.record_count, industryFlowLag, industryFlowRun?.status ?? null),
        record_count: industryFlow.record_count,
        min_trade_date: industryFlow.min_trade_date,
        latest_trade_date: industryFlow.max_trade_date,
        source_updated_at: industryFlow.source_updated_at,
        trading_days_behind: industryFlowLag,
        last_run_status: industryFlowRun?.status ?? null,
        last_success_at: industryFlowRun?.last_success_at ?? null,
        last_records_upserted: industryFlowRun?.records_upserted ?? null,
        error: industryFlowRun?.error ?? null,
      },
      {
        key: 'market_sentiment',
        label: '300ETF QVIX与全市场资金流',
        source: 'AKShare/optbbs 300ETF QVIX / 东方财富市场资金流',
        source_url: 'https://1.optbbs.com/s/vix.shtml?300ETF',
        state: datasetState(marketSentiment.record_count, marketSentimentLag, marketSentimentRun?.status ?? null, 2, marketSentiment.series_count),
        record_count: marketSentiment.record_count,
        min_trade_date: marketSentiment.min_trade_date,
        latest_trade_date: marketSentiment.max_trade_date,
        source_updated_at: marketSentiment.source_updated_at,
        trading_days_behind: marketSentimentLag,
        expected_series_count: 2,
        available_series_count: marketSentiment.series_count,
        last_run_status: marketSentimentRun?.status ?? null,
        last_success_at: marketSentimentRun?.last_success_at ?? null,
        last_records_upserted: marketSentimentRun?.records_upserted ?? null,
        error: marketSentimentRun?.error ?? null,
      },
    ];
    const collectors: DataHealthCollector[] = providerRuns.map((run) => ({
      provider: run.provider,
      run_type: run.run_type,
      status: run.status,
      started_at: run.started_at,
      finished_at: run.finished_at,
      last_success_at: run.last_success_at,
      records_upserted: run.records_upserted,
      error: run.error,
    }));
    const payload: DataHealthResponse = {
      generated_at: new Date().toISOString(),
      expected_latest_trading_date: expectedLatestTradingDate,
      datasets,
      collectors,
    };
    return Response.json(payload, {
      headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300', ...headers },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const schemaMissing = /no such table|no such column/i.test(message);
    return Response.json({
      error: schemaMissing ? 'Data health store is not ready' : 'Failed to load data health',
    }, { status: schemaMissing ? 503 : 500, headers });
  }
}
