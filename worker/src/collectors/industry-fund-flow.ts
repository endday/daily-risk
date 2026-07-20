import * as db from '../db';
import type { IndustryFundFlowRow } from './base';
import { httpRequest } from './http';

const EASTMONEY_FLOW_URL = 'https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get';

interface EastMoneyBoard {
  f12: string;
  f14: string;
}

export const EASTMONEY_PRIMARY_INDUSTRIES: EastMoneyBoard[] = [
  { f12: 'BK0420', f14: '航空机场' },
  { f12: 'BK0421', f14: '铁路公路' },
  { f12: 'BK0422', f14: '物流' },
  { f12: 'BK0424', f14: '水泥' },
  { f12: 'BK0427', f14: '公用事业' },
  { f12: 'BK0428', f14: '电力' },
  { f12: 'BK0433', f14: '农林牧渔' },
  { f12: 'BK0436', f14: '纺织服饰' },
  { f12: 'BK0437', f14: '煤炭' },
  { f12: 'BK0447', f14: '互联网服务' },
  { f12: 'BK0456', f14: '家用电器' },
  { f12: 'BK0457', f14: '电网设备' },
  { f12: 'BK0458', f14: '仪器仪表' },
  { f12: 'BK0464', f14: '石油石化' },
  { f12: 'BK0465', f14: '化学制药' },
  { f12: 'BK0475', f14: '银行Ⅱ' },
  { f12: 'BK0478', f14: '有色金属' },
  { f12: 'BK0480', f14: '航天航空' },
  { f12: 'BK0482', f14: '一般零售' },
  { f12: 'BK0485', f14: '旅游酒店' },
  { f12: 'BK0486', f14: '传媒' },
  { f12: 'BK0490', f14: '军工' },
];

interface EastMoneyFlowResponse {
  data?: {
    code?: string;
    name?: string;
    klines?: string[];
  };
}

function nullableNumber(value: string | undefined): number | null {
  if (value == null || value === '' || value === '-') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseIndustryFundFlowLine(
  boardCode: string,
  boardName: string,
  line: string,
): IndustryFundFlowRow | null {
  const fields = line.split(',');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fields[0] ?? '')) return null;

  return {
    trade_date: fields[0],
    board_code: boardCode,
    board_name: boardName,
    provider: 'eastmoney',
    main_net_inflow: nullableNumber(fields[1]),
    small_net_inflow: nullableNumber(fields[2]),
    medium_net_inflow: nullableNumber(fields[3]),
    large_net_inflow: nullableNumber(fields[4]),
    super_large_net_inflow: nullableNumber(fields[5]),
    main_net_inflow_ratio: nullableNumber(fields[6]),
    small_net_inflow_ratio: nullableNumber(fields[7]),
    medium_net_inflow_ratio: nullableNumber(fields[8]),
    large_net_inflow_ratio: nullableNumber(fields[9]),
    super_large_net_inflow_ratio: nullableNumber(fields[10]),
    close_price: nullableNumber(fields[11]),
    change_pct: nullableNumber(fields[12]),
    source_updated_at: new Date().toISOString(),
  };
}

async function fetchBoardFlow(board: EastMoneyBoard, limit: number): Promise<IndustryFundFlowRow[]> {
  const response = await httpRequest<EastMoneyFlowResponse>(EASTMONEY_FLOW_URL, {
    searchParams: {
      lmt: limit,
      klt: 101,
      secid: `90.${board.f12}`,
      fields1: 'f1,f2,f3,f7',
      fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63',
    },
    headers: { Referer: 'https://data.eastmoney.com/' },
  });

  const boardName = response.data?.name;
  if (boardName !== board.f14) {
    throw new Error(`board identity mismatch: expected ${board.f14}, received ${boardName ?? 'empty'}`);
  }
  const klines = response.data?.klines ?? [];
  if (klines.length === 0) {
    throw new Error(`no fund flow history returned for ${board.f14}`);
  }
  return klines
    .map((line) => parseIndustryFundFlowLine(board.f12, board.f14, line))
    .filter((row): row is IndustryFundFlowRow => row != null);
}

export async function syncIndustryFundFlows(
  database: D1Database,
  requestedLimit?: number,
): Promise<{ boards: number; rows: number; failedBoards: string[] }> {
  const coverage = await db.getIndustryFundFlowRange(database);
  const limit = requestedLimit ?? (coverage.count === 0 ? 140 : 7);
  const boards = EASTMONEY_PRIMARY_INDUSTRIES;
  const rows: IndustryFundFlowRow[] = [];
  const failedBoards: string[] = [];

  for (let i = 0; i < boards.length; i += 4) {
    const batch = boards.slice(i, i + 4);
    const results = await Promise.allSettled(batch.map((board) => fetchBoardFlow(board, limit)));
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        rows.push(...result.value);
      } else {
        failedBoards.push(batch[index].f14);
        console.warn(`[IndustryFlow] ${batch[index].f14} failed: ${result.reason}`);
      }
    });
  }

  await db.upsertIndustryFundFlowRows(database, rows);
  return { boards: boards.length, rows: rows.length, failedBoards };
}
