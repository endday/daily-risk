import { execFileSync } from 'node:child_process';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const MARKET_INSTRUMENTS = [
  { code: '000001', name: '上证指数', secid: '1.000001', type: 'broad_index' },
  { code: '000300', name: '沪深300', secid: '1.000300', type: 'broad_index' },
  { code: '000905', name: '中证500', secid: '1.000905', type: 'broad_index' },
  { code: '399006', name: '创业板指', secid: '0.399006', type: 'broad_index' },
  { code: '000688', name: '科创50', secid: '1.000688', type: 'broad_index' },
  { code: '159915', name: '创业板ETF', secid: '0.159915', type: 'theme_etf' },
  { code: '588000', name: '科创50ETF', secid: '1.588000', type: 'theme_etf' },
  { code: '512010', name: '医药ETF', secid: '1.512010', type: 'industry_etf' },
  { code: '512880', name: '证券ETF', secid: '1.512880', type: 'industry_etf' },
  { code: '515790', name: '光伏ETF', secid: '1.515790', type: 'industry_etf' },
];

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.resolve(SCRIPT_DIR, '..');
const DEFAULT_STOCKDB_ROOT = path.resolve(WORKER_DIR, '..', '..', 'free-stockdb');
const DEFAULT_STOCKDB_HOST = '127.0.0.1';
const DEFAULT_STOCKDB_PORT = 7899;
const EASTMONEY_KLINE_URL = 'https://push2his.eastmoney.com/api/qt/stock/kline/get';

function parseArgs(argv) {
  const result = {
    startDate: null,
    endDate: null,
    days: null,
    batchSize: 100,
    instrumentCode: null,
    stockdbRoot: DEFAULT_STOCKDB_ROOT,
    stockdbHost: DEFAULT_STOCKDB_HOST,
    stockdbPort: DEFAULT_STOCKDB_PORT,
    mode: 'local',
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) continue;

    if (key === '--start-date') result.startDate = value;
    if (key === '--end-date') result.endDate = value;
    if (key === '--days') result.days = Number(value);
    if (key === '--batch-size') result.batchSize = Number(value);
    if (key === '--instrument-code') result.instrumentCode = value;
    if (key === '--stockdb-root') result.stockdbRoot = value;
    if (key === '--stockdb-host') result.stockdbHost = value;
    if (key === '--stockdb-port') result.stockdbPort = Number(value);
    if (key === '--mode') result.mode = value;
  }

  if (result.days != null && (!Number.isInteger(result.days) || result.days <= 0)) {
    throw new Error(`Invalid --days value: ${result.days}`);
  }

  if (!result.endDate) {
    const today = new Date();
    result.endDate = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-');
  }

  if (!result.startDate && result.days != null) {
    const start = new Date(`${result.endDate}T00:00:00`);
    start.setDate(start.getDate() - result.days + 1);
    result.startDate = [
      start.getFullYear(),
      String(start.getMonth() + 1).padStart(2, '0'),
      String(start.getDate()).padStart(2, '0'),
    ].join('-');
  }

  if (!result.startDate || !result.endDate) {
    throw new Error(
      'Usage: node init-instrument-daily-local.mjs --start-date YYYY-MM-DD --end-date YYYY-MM-DD [--days N] [--mode local|remote]',
    );
  }

  if (!['local', 'remote'].includes(result.mode)) {
    throw new Error(`Invalid --mode value: ${result.mode}`);
  }

  return result;
}

function toCompactDate(value) {
  return value.replace(/-/g, '');
}

function formatTradeDate(value) {
  const s = String(value);
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

function parseNumber(value) {
  if (!value || value === '-') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toFreeStockdbUrl(host, port, code, startDate, endDate) {
  const params = new URLSearchParams({
    cmd: 'vals',
    t: '日k',
    k1: `key:${code}`,
    k2: `fwd:${toCompactDate(startDate)},${toCompactDate(endDate)}`,
  });
  return `http://${host}:${port}/?${params.toString()}`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'DailyRisk-FreeStockDB-Init/1.0' },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${url}`);
  }

  return response.json();
}

async function isStockdbReady(host, port) {
  try {
    const url = `http://${host}:${port}/?cmd=get&t=${encodeURIComponent('股票代码')}`;
    const json = await fetchJson(url);
    return Boolean(json && typeof json === 'object');
  } catch {
    return false;
  }
}

async function ensureStockdbRunning(stockdbRoot, host, port) {
  if (await isStockdbReady(host, port)) {
    return;
  }

  const exePath = path.join(stockdbRoot, 'stockdb.exe');
  const confPath = path.join(stockdbRoot, 'stockdb.conf');
  const child = spawn(exePath, [confPath], {
    cwd: stockdbRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();

  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    if (await isStockdbReady(host, port)) {
      return;
    }
  }

  throw new Error(`free-stockdb service is not reachable at ${host}:${port}`);
}

function parseStockdbRows(instrument, rows) {
  const sortedRows = rows
    .filter((row) => row && typeof row === 'object' && row.date)
    .sort((a, b) => Number(a.date) - Number(b.date));

  let previousClose = null;
  return sortedRows.map((raw) => {
    const preClose = parseNumber(raw.pre_close) ?? previousClose;
    const close = parseNumber(raw.close);
    const closeForDiff = close ?? 0;
    const preCloseForDiff = preClose ?? 0;

    const row = {
      trade_date: formatTradeDate(raw.date),
      instrument_code: instrument.code,
      instrument_name: raw.name || instrument.name,
      instrument_type: instrument.type,
      provider: 'free-stockdb',
      open_price: parseNumber(raw.open),
      high_price: parseNumber(raw.high),
      low_price: parseNumber(raw.low),
      close_price: close,
      pre_close_price: preClose,
      change_pct: parseNumber(raw.pct_chg),
      change_amount: preClose == null || close == null ? null : Number((closeForDiff - preCloseForDiff).toFixed(4)),
      amplitude: parseNumber(raw.amplitude),
      volume: parseNumber(raw.volume),
      amount: parseNumber(raw.amount),
      turnover_rate: parseNumber(raw.turnover),
      pe_ttm: parseNumber(raw.pe_ttm),
      pb: parseNumber(raw.pb),
      total_market_cap: parseNumber(raw.total_mv),
      float_market_cap: parseNumber(raw.float_mv),
      is_st: raw.is_st == null ? null : raw.is_st ? 1 : 0,
      source_updated_at: new Date().toISOString(),
    };

    previousClose = close;
    return row;
  });
}

function looksLikeExpectedInstrument(instrument, rows) {
  if (!rows.length) return false;
  const first = rows[0];
  if (!first) return false;

  if (String(first.code || '') !== instrument.code) return false;

  if (instrument.type === 'broad_index') {
    const name = String(first.name || '');
    if (!name.includes('指数') && !name.includes('沪深') && !name.includes('中证') && !name.includes('创业板') && !name.includes('科创')) {
      return false;
    }
  }

  return true;
}

function parseEastmoneyKlines(instrument, klines) {
  let previousClose = null;
  return klines.map((line) => {
    const [
      tradeDate,
      openPrice,
      closePrice,
      highPrice,
      lowPrice,
      volume,
      amount,
      amplitude,
      changePct,
      changeAmount,
      turnoverRate,
    ] = line.split(',');

    const close = parseNumber(closePrice);
    const row = {
      trade_date: tradeDate,
      instrument_code: instrument.code,
      instrument_name: instrument.name,
      instrument_type: instrument.type,
      provider: 'eastmoney_push2his',
      open_price: parseNumber(openPrice),
      high_price: parseNumber(highPrice),
      low_price: parseNumber(lowPrice),
      close_price: close,
      pre_close_price: previousClose,
      change_pct: parseNumber(changePct),
      change_amount: parseNumber(changeAmount),
      amplitude: parseNumber(amplitude),
      volume: parseNumber(volume),
      amount: parseNumber(amount),
      turnover_rate: parseNumber(turnoverRate),
      pe_ttm: null,
      pb: null,
      total_market_cap: null,
      float_market_cap: null,
      is_st: null,
      source_updated_at: new Date().toISOString(),
    };

    previousClose = close;
    return row;
  });
}

async function fetchHistoryFromEastmoney(instrument, startDate, endDate) {
  const url =
    `${EASTMONEY_KLINE_URL}?secid=${instrument.secid}` +
    '&fields1=f1,f2,f3,f4,f5,f6' +
    '&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' +
    '&klt=101&fqt=0' +
    `&beg=${toCompactDate(startDate)}` +
    `&end=${toCompactDate(endDate)}`;

  const json = await fetchJson(url);
  const klines = json?.data?.klines || [];
  return parseEastmoneyKlines(instrument, klines);
}

async function fetchHistory(instrument, startDate, endDate, stockdbHost, stockdbPort) {
  const url = toFreeStockdbUrl(stockdbHost, stockdbPort, instrument.code, startDate, endDate);
  const json = await fetchJson(url);
  if (!Array.isArray(json)) {
    throw new Error(`Unexpected free-stockdb response for ${instrument.code}`);
  }

  const stockdbRows = parseStockdbRows(instrument, json);
  if (looksLikeExpectedInstrument(instrument, stockdbRows)) {
    return stockdbRows;
  }

  return fetchHistoryFromEastmoney(instrument, startDate, endDate);
}

async function fetchHistoryWithRetry(
  instrument,
  startDate,
  endDate,
  stockdbRoot,
  stockdbHost,
  stockdbPort,
  retries = 3,
) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await ensureStockdbRunning(stockdbRoot, stockdbHost, stockdbPort);
      return await fetchHistory(instrument, startDate, endDate, stockdbHost, stockdbPort);
    } catch (error) {
      lastError = error;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  throw lastError;
}

function quote(value) {
  if (value == null) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildUpsertSql(rows) {
  const columns = [
    'trade_date', 'instrument_code', 'instrument_name', 'instrument_type', 'provider',
    'open_price', 'high_price', 'low_price', 'close_price', 'pre_close_price',
    'change_pct', 'change_amount', 'amplitude', 'volume', 'amount', 'turnover_rate',
    'pe_ttm', 'pb', 'total_market_cap', 'float_market_cap', 'is_st', 'source_updated_at',
  ];

  const values = rows.map((row) => `(${columns.map((column) => quote(row[column])).join(', ')})`).join(',\n');

  return `
INSERT INTO instrument_daily (${columns.join(', ')})
VALUES
${values}
ON CONFLICT(trade_date, instrument_code) DO UPDATE SET
  instrument_name = excluded.instrument_name,
  instrument_type = excluded.instrument_type,
  provider = excluded.provider,
  open_price = COALESCE(excluded.open_price, instrument_daily.open_price),
  high_price = COALESCE(excluded.high_price, instrument_daily.high_price),
  low_price = COALESCE(excluded.low_price, instrument_daily.low_price),
  close_price = COALESCE(excluded.close_price, instrument_daily.close_price),
  pre_close_price = COALESCE(excluded.pre_close_price, instrument_daily.pre_close_price),
  change_pct = COALESCE(excluded.change_pct, instrument_daily.change_pct),
  change_amount = COALESCE(excluded.change_amount, instrument_daily.change_amount),
  amplitude = COALESCE(excluded.amplitude, instrument_daily.amplitude),
  volume = COALESCE(excluded.volume, instrument_daily.volume),
  amount = COALESCE(excluded.amount, instrument_daily.amount),
  turnover_rate = COALESCE(excluded.turnover_rate, instrument_daily.turnover_rate),
  pe_ttm = COALESCE(excluded.pe_ttm, instrument_daily.pe_ttm),
  pb = COALESCE(excluded.pb, instrument_daily.pb),
  total_market_cap = COALESCE(excluded.total_market_cap, instrument_daily.total_market_cap),
  float_market_cap = COALESCE(excluded.float_market_cap, instrument_daily.float_market_cap),
  is_st = COALESCE(excluded.is_st, instrument_daily.is_st),
  source_updated_at = COALESCE(excluded.source_updated_at, instrument_daily.source_updated_at),
  updated_at = datetime('now');
`.trim();
}

function executeSql(sql, mode) {
  const wranglerBin = path.resolve(WORKER_DIR, '..', 'node_modules', '.bin', 'wrangler.cmd');
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'daily-risk-init-'));
  const sqlFile = path.join(tempDir, 'batch.sql');

  writeFileSync(sqlFile, sql, 'utf8');

  try {
    const wranglerArgs = ['d1', 'execute', 'daily-risk'];
    if (mode === 'local') {
      wranglerArgs.push('--local');
    } else if (mode === 'remote') {
      wranglerArgs.push('--remote');
    }
    wranglerArgs.push('--file', sqlFile);

    execFileSync(
      wranglerBin,
      wranglerArgs,
      {
        cwd: WORKER_DIR,
        stdio: 'pipe',
        shell: true,
      },
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function executeRows(rows, mode, batchSize) {
  const statements = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    statements.push(buildUpsertSql(rows.slice(i, i + batchSize)));
  }

  if (mode === 'remote') {
    executeSql(statements.join('\n\n'), mode);
    return;
  }

  for (const statement of statements) {
    executeSql(statement, mode);
  }
}

async function main() {
  const args = parseArgs(process.argv);
  const instruments = args.instrumentCode
    ? MARKET_INSTRUMENTS.filter((instrument) => instrument.code === args.instrumentCode)
    : MARKET_INSTRUMENTS;

  if (instruments.length === 0) {
    throw new Error(`Unknown instrument code: ${args.instrumentCode}`);
  }

  let totalRows = 0;

  for (const instrument of instruments) {
    const rows = await fetchHistoryWithRetry(
      instrument,
      args.startDate,
      args.endDate,
      args.stockdbRoot,
      args.stockdbHost,
      args.stockdbPort,
    );
    totalRows += rows.length;

    executeRows(rows, args.mode, args.batchSize);

    console.log(`${instrument.code} ${instrument.name}: ${rows.length} rows`);
  }

  console.log(`done: ${instruments.length} instruments, ${totalRows} rows, target=${args.mode}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
