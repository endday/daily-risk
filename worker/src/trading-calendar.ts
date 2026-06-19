/**
 * A 股交易日历
 *
 * 数据源：timor.tech/api/holiday（免费，无需 key）
 * 包含：法定假日 + 调休补班（周末变交易日）
 *
 * 使用方式：
 * 1. 每年 1 月调一次 syncTradingCalendar() 写入 D1
 * 2. 用 isTradingDay() 查询某天是否交易日
 */

import { http } from './collectors/http';

/** timor.tech 单日条目结构 */
interface TimorDayEntry {
  holiday: boolean;
  name: string;
  date: string;
  after?: boolean;  // true = 补班（周末变交易日）
}

/** timor.tech 返回的年度数据 */
interface TimorYearResponse {
  code: number;
  holiday: Record<string, TimorDayEntry>;
}

/**
 * 从 timor.tech 同步某年假日数据到 D1
 * @returns 写入的行数
 */
export async function syncTradingCalendar(
  db: D1Database,
  year: number,
): Promise<number> {
  console.log(`[TradingCalendar] Syncing ${year} from timor.tech...`);

  const url = `http://timor.tech/api/holiday/year/${year}`;
  const data = await http.get(url, { timeout: 15000 }).json<TimorYearResponse>();

  if (data.code !== 0 || !data.holiday) {
    throw new Error(`timor.tech returned code ${data.code}`);
  }

  const entries = Object.values(data.holiday);
  if (entries.length === 0) {
    console.warn(`[TradingCalendar] No data for ${year}`);
    return 0;
  }

  // 批量 upsert
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO trading_holidays (date, is_holiday, name)
     VALUES (?1, ?2, ?3)`
  );

  const batch = entries.map(entry => {
    const isHoliday = entry.holiday ? 1 : 0;
    return stmt.bind(entry.date, isHoliday, entry.name);
  });

  // D1 batch 限制 100 条，分批执行
  for (let i = 0; i < batch.length; i += 100) {
    await db.batch(batch.slice(i, i + 100));
  }

  console.log(`[TradingCalendar] ${year}: synced ${entries.length} entries`);
  return entries.length;
}

/**
 * 判断某日是否为 A 股交易日
 *
 * 规则：
 * 1. 周六日 → 永远休市（A 股从不在周末开市，调休补班也不例外）
 * 2. 在假日表中且 is_holiday=1 → 休市
 * 3. 其他工作日 → 交易日
 */
export async function isTradingDay(
  db: D1Database,
  dateStr: string,
): Promise<boolean> {
  const d = new Date(dateStr + 'T00:00:00+08:00');
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;

  const row = await db
    .prepare('SELECT is_holiday FROM trading_holidays WHERE date = ?1')
    .bind(dateStr)
    .first<{ is_holiday: number }>();

  if (row && row.is_holiday === 1) return false;

  return true;
}

/**
 * 查找下一个交易日（跳过假日和周末，包含调休补班）
 */
export async function getNextTradingDay(
  db: D1Database,
  dateStr: string,
): Promise<string> {
  const d = new Date(dateStr + 'T00:00:00+08:00');

  for (let i = 1; i <= 30; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const next = toDateStr(d);
    if (await isTradingDay(db, next)) {
      return next;
    }
  }

  // 极端情况：30 天内无交易日（不应发生）
  throw new Error(`No trading day found within 30 days after ${dateStr}`);
}

/** Date → 'YYYY-MM-DD' (UTC+8) */
function toDateStr(d: Date): string {
  // 转为北京时间
  const bj = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const y = bj.getUTCFullYear();
  const m = String(bj.getUTCMonth() + 1).padStart(2, '0');
  const day = String(bj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
