import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const qvixUrl = 'https://1.optbbs.com/d/csv/d/k.csv';
const flowUrl = 'https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get';
const days = Math.min(Math.max(Number(process.argv[2] ?? 1825), 10), 1825);

function nullableNumber(value) {
  if (value == null || value === '' || value === '-' || value === '.') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlValue(value) {
  if (value == null || !Number.isFinite(value)) return 'NULL';
  return String(value);
}

function parseDate(value) {
  const match = value?.trim().match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  return match
    ? `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
    : null;
}

function parseQvixCsv(csv) {
  const points = [];
  let previous = null;
  for (const line of csv.split(/\r?\n/).filter(Boolean).slice(1)) {
    const fields = line.split(',');
    const tradeDate = parseDate(fields[0]);
    const close = nullableNumber(fields[4]);
    if (!tradeDate || close == null || close <= 0) continue;
    points.push({
      trade_date: tradeDate,
      qvix_close: close,
      qvix_change_pct: previous == null ? null : Number(((close / previous - 1) * 100).toFixed(2)),
    });
    previous = close;
  }
  return points.slice(-Math.max(days, 10));
}

function parseMarketFlowLine(line) {
  const fields = line.split(',');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields[0] ?? '')) return null;
  return {
    trade_date: fields[0],
    main_net_inflow: nullableNumber(fields[1]),
    small_net_inflow: nullableNumber(fields[2]),
    medium_net_inflow: nullableNumber(fields[3]),
    large_net_inflow: nullableNumber(fields[4]),
    super_large_net_inflow: nullableNumber(fields[5]),
    main_net_inflow_ratio: nullableNumber(fields[6]),
    market_close_price: nullableNumber(fields[11]),
    market_change_pct: nullableNumber(fields[12]),
  };
}

function mergeRows(qvixPoints, flowPoints) {
  const now = new Date().toISOString();
  const rows = new Map();
  for (const point of qvixPoints) {
    rows.set(point.trade_date, {
      trade_date: point.trade_date,
      provider: 'optbbs_qvix',
      qvix_close: point.qvix_close,
      qvix_change_pct: point.qvix_change_pct,
      market_close_price: null,
      market_change_pct: null,
      main_net_inflow: null,
      small_net_inflow: null,
      medium_net_inflow: null,
      large_net_inflow: null,
      super_large_net_inflow: null,
      main_net_inflow_ratio: null,
      source_updated_at: now,
    });
  }
  for (const point of flowPoints) {
    const row = rows.get(point.trade_date) ?? {
      trade_date: point.trade_date,
      provider: 'eastmoney_market_flow',
      qvix_close: null,
      qvix_change_pct: null,
      market_close_price: null,
      market_change_pct: null,
      main_net_inflow: null,
      small_net_inflow: null,
      medium_net_inflow: null,
      large_net_inflow: null,
      super_large_net_inflow: null,
      main_net_inflow_ratio: null,
      source_updated_at: null,
    };
    Object.assign(row, point, {
      provider: row.qvix_close != null ? 'optbbs_qvix+eastmoney_market_flow' : 'eastmoney_market_flow',
      source_updated_at: now,
    });
    rows.set(point.trade_date, row);
  }
  return [...rows.values()].sort((a, b) => a.trade_date.localeCompare(b.trade_date));
}

function values(row) {
  return [
    sqlString(row.trade_date),
    sqlString(row.provider),
    sqlValue(row.qvix_close),
    sqlValue(row.qvix_change_pct),
    sqlValue(row.market_close_price),
    sqlValue(row.market_change_pct),
    sqlValue(row.main_net_inflow),
    sqlValue(row.small_net_inflow),
    sqlValue(row.medium_net_inflow),
    sqlValue(row.large_net_inflow),
    sqlValue(row.super_large_net_inflow),
    sqlValue(row.main_net_inflow_ratio),
    sqlString(row.source_updated_at),
  ].join(', ');
}

function buildSql(rows) {
  const statements = [];
  for (let index = 0; index < rows.length; index += 100) {
    const chunk = rows.slice(index, index + 100);
    statements.push(`
INSERT INTO market_sentiment_daily (
  trade_date, provider, qvix_close, qvix_change_pct,
  market_close_price, market_change_pct,
  main_net_inflow, small_net_inflow, medium_net_inflow,
  large_net_inflow, super_large_net_inflow,
  main_net_inflow_ratio, source_updated_at
) VALUES
${chunk.map((row) => `(${values(row)})`).join(',\n')}
ON CONFLICT(trade_date) DO UPDATE SET
  provider = excluded.provider,
  qvix_close = COALESCE(excluded.qvix_close, market_sentiment_daily.qvix_close),
  qvix_change_pct = COALESCE(excluded.qvix_change_pct, market_sentiment_daily.qvix_change_pct),
  market_close_price = COALESCE(excluded.market_close_price, market_sentiment_daily.market_close_price),
  market_change_pct = COALESCE(excluded.market_change_pct, market_sentiment_daily.market_change_pct),
  main_net_inflow = COALESCE(excluded.main_net_inflow, market_sentiment_daily.main_net_inflow),
  small_net_inflow = COALESCE(excluded.small_net_inflow, market_sentiment_daily.small_net_inflow),
  medium_net_inflow = COALESCE(excluded.medium_net_inflow, market_sentiment_daily.medium_net_inflow),
  large_net_inflow = COALESCE(excluded.large_net_inflow, market_sentiment_daily.large_net_inflow),
  super_large_net_inflow = COALESCE(excluded.super_large_net_inflow, market_sentiment_daily.super_large_net_inflow),
  main_net_inflow_ratio = COALESCE(excluded.main_net_inflow_ratio, market_sentiment_daily.main_net_inflow_ratio),
  source_updated_at = COALESCE(excluded.source_updated_at, market_sentiment_daily.source_updated_at),
  updated_at = datetime('now');
`);
  }
  return statements.join('\n');
}

function fetchText(url, headers = {}) {
  const sourceDir = process.env.MARKET_SENTIMENT_INPUT_DIR;
  if (sourceDir) {
    const fileName = url.includes('optbbs.com') ? 'qvix.csv' : 'flow.json';
    return readFileSync(path.join(sourceDir, fileName), 'utf8');
  }
  const psString = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const headerEntries = Object.entries({
    'User-Agent': 'DailyRisk-Worker/1.0',
    ...headers,
  });
  const headerLiteral = `@{${headerEntries
    .map(([key, value]) => `${psString(key)}=${psString(value)}`)
    .join('; ')}}`;
  const command = [
    "$ErrorActionPreference = 'Stop'",
    `$response = Invoke-WebRequest -UseBasicParsing -Headers ${headerLiteral} -Uri ${psString(url)}`,
    '[Console]::Out.Write($response.Content)',
  ].join('; ');
  return execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    command,
  ], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
}

const qvixPoints = parseQvixCsv(fetchText(qvixUrl));

const flowParams = new URLSearchParams({
  lmt: String(Math.min(Math.max(days, 10), 250)),
  klt: '101',
  secid: '1.000001',
  ut: 'fa5fd1943c7b386172d6893dbfba10b',
  fields1: 'f1,f2,f3,f7',
  fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63',
});
const flowPayload = JSON.parse(fetchText(`${flowUrl}?${flowParams}`, {
  Referer: 'https://quote.eastmoney.com/',
}));
const flowPoints = (flowPayload.data?.klines ?? [])
  .map(parseMarketFlowLine)
  .filter(Boolean);

const rows = mergeRows(qvixPoints, flowPoints);
if (rows.length === 0) throw new Error('No market sentiment rows returned');

const tempDir = mkdtempSync(path.join(os.tmpdir(), 'daily-risk-sentiment-'));
const sqlFile = path.join(tempDir, 'market-sentiment.sql');
writeFileSync(sqlFile, buildSql(rows), 'utf8');

try {
  const wranglerCli = path.resolve(process.cwd(), '..', 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  execFileSync(process.execPath, [wranglerCli, 'd1', 'execute', 'daily-risk', '--remote', '--file', sqlFile], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

console.log(JSON.stringify({
  days,
  qvix_rows: qvixPoints.length,
  flow_rows: flowPoints.length,
  merged_rows: rows.length,
}, null, 2));
