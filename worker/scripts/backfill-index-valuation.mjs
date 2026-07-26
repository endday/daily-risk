const CSINDEX_PERF_URL = 'https://www.csindex.com.cn/csindex-home/perf/index-perf';
const CSINDEX_CODES = [
  '000016', '000300', '000510', '000852', '000903', '000905', '000688',
  '399812', '399975', '000932', '000989', '399989', '000991', '399986', '000993',
  'H30094', '399971', '399967', '000827', '931187', '931087',
  '950090', '930782', '000922', '000919',
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function compactDate(value) {
  return value.replace(/-/g, '');
}

function tradeDate(value) {
  const compact = String(value).replace(/\D/g, '');
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readArgs(argv) {
  const options = { apiBase: null, startDate: '2020-01-01', endDate: today(), batchSize: 100 };
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) continue;
    if (key === '--api-base') options.apiBase = value;
    if (key === '--start-date') options.startDate = value;
    if (key === '--end-date') options.endDate = value;
    if (key === '--batch-size') options.batchSize = Number(value);
  }
  if (!options.apiBase || !/^https?:\/\//.test(options.apiBase)) {
    throw new Error('Usage: node scripts/backfill-index-valuation.mjs --api-base https://<worker-domain> [--start-date YYYY-MM-DD] [--end-date YYYY-MM-DD]');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(options.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(options.endDate)) {
    throw new Error('Dates must use YYYY-MM-DD');
  }
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 100) {
    throw new Error('--batch-size must be between 1 and 100');
  }
  if (!process.env.ADMIN_TOKEN) throw new Error('ADMIN_TOKEN is required');
  return options;
}

async function fetchHistory(code, startDate, endDate) {
  const params = new URLSearchParams({ indexCode: code, startDate: compactDate(startDate), endDate: compactDate(endDate) });
  const response = await fetch(`${CSINDEX_PERF_URL}?${params}`, { headers: { 'User-Agent': 'DailyRisk-Valuation-Backfill/1.0' } });
  if (!response.ok) throw new Error(`${code}: CSIndex returned HTTP ${response.status}`);
  const payload = await response.json();
  if (String(payload.code) !== '200') throw new Error(`${code}: CSIndex returned ${payload.code || 'an invalid payload'}`);
  return (payload.data || []).flatMap((item) => {
    const date = tradeDate(item.tradeDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
    const close = numberOrNull(item.close);
    const change = numberOrNull(item.change);
    const pe = numberOrNull(item.peg);
    return [{
      trade_date: date,
      instrument_code: code,
      instrument_name: item.indexNameCn || code,
      instrument_type: 'valuation_index',
      provider: 'csindex_index_perf',
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
      source_updated_at: new Date().toISOString(),
    }];
  });
}

async function uploadRows(apiBase, rows, batchSize) {
  const endpoint = new URL('/admin/init-instrument-daily', apiBase).toString();
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.ADMIN_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ rows: rows.slice(offset, offset + batchSize) }),
    });
    if (!response.ok) throw new Error(`Upload failed with HTTP ${response.status}: ${await response.text()}`);
  }
}

async function main() {
  const options = readArgs(process.argv);
  let totalRows = 0;
  for (const code of CSINDEX_CODES) {
    const rows = await fetchHistory(code, options.startDate, options.endDate);
    await uploadRows(options.apiBase, rows, options.batchSize);
    totalRows += rows.length;
    console.log(`${code}: ${rows.length} rows uploaded`);
  }
  console.log(`done: ${CSINDEX_CODES.length} PE series, ${totalRows} rows`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
