import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CSINDEX_PERF_URL = 'https://www.csindex.com.cn/csindex-home/perf/index-perf';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = path.resolve(SCRIPT_DIR, '..');

const INDICES = [
  { code: '000016', name: '上证50', category: 'broad' },
  { code: '000300', name: '沪深300', category: 'broad' },
  { code: '000510', name: '中证A500', category: 'broad' },
  { code: '000852', name: '中证1000', category: 'broad' },
  { code: '000903', name: '中证A100', category: 'broad' },
  { code: '000905', name: '中证500', category: 'broad' },
  { code: '000688', name: '科创50', category: 'broad' },
  { code: '399812', name: '养老产业', category: 'industry' },
  { code: '399975', name: '证券公司', category: 'industry' },
  { code: '000932', name: '主要消费', category: 'industry' },
  { code: '000989', name: '全指可选', category: 'industry' },
  { code: '399989', name: '中证医疗', category: 'industry' },
  { code: '000991', name: '全指医药', category: 'industry' },
  { code: '399986', name: '中证银行', category: 'industry' },
  { code: '000993', name: '全指信息', category: 'industry' },
  { code: 'H30094', name: '消费红利', category: 'theme' },
  { code: '399971', name: '中证传媒', category: 'theme' },
  { code: '399967', name: '中证军工', category: 'theme' },
  { code: '000827', name: '中证环保', category: 'theme' },
  { code: '931187', name: '中证科技100', category: 'theme' },
  { code: '931087', name: '科技龙头', category: 'theme' },
  { code: '950090', name: '上证50AH优选', category: 'strategy' },
  { code: '930782', name: '500行业中性低波', category: 'strategy' },
  { code: '000922', name: '中证红利', category: 'strategy' },
  { code: '000919', name: '沪深300价值', category: 'strategy' },
];

function isoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateYearsAgo(years) {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function readArgs(argv) {
  const options = {
    startDate: dateYearsAgo(6),
    endDate: new Date().toISOString().slice(0, 10),
    indexCode: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!value) continue;
    if (key === '--start-date') options.startDate = value;
    if (key === '--end-date') options.endDate = value;
    if (key === '--index-code') options.indexCode = value;
  }

  if (!isoDate(options.startDate) || !isoDate(options.endDate) || options.startDate > options.endDate) {
    throw new Error('--start-date and --end-date must be ISO dates, with start <= end');
  }
  if (options.indexCode && !INDICES.some((index) => index.code === options.indexCode)) {
    throw new Error(`Unknown valuation index: ${options.indexCode}`);
  }
  return options;
}

function compactDate(value) {
  return value.replace(/-/g, '');
}

function tradeDate(value) {
  const compact = String(value ?? '').replace(/\D/g, '');
  if (!/^\d{8}$/.test(compact)) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function numberOrNull(value) {
  if (value == null || value === '' || value === '-') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fetchHistory(index, startDate, endDate) {
  const params = new URLSearchParams({
    indexCode: index.code,
    startDate: compactDate(startDate),
    endDate: compactDate(endDate),
  });
  const response = await fetch(`${CSINDEX_PERF_URL}?${params}`, {
    headers: { 'User-Agent': 'DailyRisk-Valuation-Initializer/1.0' },
  });
  if (!response.ok) throw new Error(`${index.code}: CSIndex returned HTTP ${response.status}`);

  const payload = await response.json();
  if (String(payload.code) !== '200') throw new Error(`${index.code}: CSIndex returned ${payload.code || 'an invalid payload'}`);

  const sourceUpdatedAt = new Date().toISOString();
  return (payload.data || []).flatMap((item) => {
    const date = tradeDate(item.tradeDate);
    if (!date) return [];
    const close = numberOrNull(item.close);
    const change = numberOrNull(item.change);
    const pe = numberOrNull(item.peg);
    return [{
      trade_date: date,
      instrument_code: index.code,
      instrument_name: index.name,
      instrument_type: `${index.category}_index`,
      provider: 'csindex',
      open_price: null,
      high_price: null,
      low_price: null,
      close_price: close,
      pre_close_price: close != null && change != null ? close - change : null,
      change_pct: numberOrNull(item.changePct),
      change_amount: change,
      amplitude: null,
      volume: null,
      amount: null,
      turnover_rate: null,
      pe_ttm: pe != null && pe > 0 ? pe : null,
      pb: null,
      total_market_cap: null,
      float_market_cap: null,
      is_st: null,
      source_updated_at: sourceUpdatedAt,
    }];
  });
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
  pe_ttm = COALESCE(excluded.pe_ttm, instrument_daily.pe_ttm),
  source_updated_at = excluded.source_updated_at,
  updated_at = CURRENT_TIMESTAMP;
`;
}

function executeRemoteSql(sql) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'daily-risk-valuation-'));
  const sqlFile = path.join(tempDir, 'valuation.sql');
  const wranglerBin = path.resolve(WORKER_DIR, '..', 'node_modules', '.bin', 'wrangler.cmd');
  writeFileSync(sqlFile, sql, 'utf8');
  try {
    execFileSync(wranglerBin, ['d1', 'execute', 'daily-risk', '--remote', '--file', sqlFile], {
      cwd: WORKER_DIR,
      stdio: 'pipe',
      shell: true,
    });
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function executeRows(rows, batchSize = 50) {
  const statements = [];
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    statements.push(buildUpsertSql(rows.slice(offset, offset + batchSize)));
  }
  executeRemoteSql(statements.join('\n'));
}

async function main() {
  const options = readArgs(process.argv);
  const indices = options.indexCode
    ? INDICES.filter((index) => index.code === options.indexCode)
    : INDICES;
  let totalRows = 0;

  for (const index of indices) {
    const rows = await fetchHistory(index, options.startDate, options.endDate);
    if (rows.length === 0) throw new Error(`${index.code}: CSIndex returned no rows`);
    executeRows(rows);
    totalRows += rows.length;
    console.log(`${index.code}: ${rows.length} rows imported`);
  }
  console.log(`done: ${indices.length} PE series, ${totalRows} rows`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
