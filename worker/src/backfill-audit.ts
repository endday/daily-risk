export interface BackfillWindowValidation {
  ok: boolean;
  error?: string;
  spanDays?: number;
}

export interface BackfillAuditSummary {
  index_code: string;
  start_date: string;
  end_date: string;
  trade_day_count: number;
  total_rows: number;
  close_rows: number;
  pe_rows: number;
  bond_rows: number;
  erp_ready_rows: number;
  min_date: string | null;
  max_date: string | null;
  erp_ready_ratio: number;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

export function validateBackfillWindow(
  startDate: string,
  endDate: string,
  maxDays: number = 731,
): BackfillWindowValidation {
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return { ok: false, error: 'Invalid date format, expected YYYY-MM-DD' };
  }

  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: 'Invalid date value' };
  }

  if (start > end) {
    return { ok: false, error: 'startDate must be earlier than or equal to endDate' };
  }

  const spanDays = Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
  if (spanDays > maxDays) {
    return { ok: false, error: `Date range too large (${spanDays} days). Split into chunks <= ${maxDays} days.` };
  }

  return { ok: true, spanDays };
}

export async function getBackfillAuditSummary(
  db: D1Database,
  startDate: string,
  endDate: string,
  indexCode: string = '000300',
): Promise<BackfillAuditSummary> {
  const summaryResult = await db.prepare(`
    SELECT
      COUNT(*) AS total_rows,
      COUNT(DISTINCT trade_date) AS trade_day_count,
      SUM(CASE WHEN close_price IS NOT NULL THEN 1 ELSE 0 END) AS close_rows,
      SUM(CASE WHEN pe_ttm IS NOT NULL THEN 1 ELSE 0 END) AS pe_rows,
      SUM(CASE WHEN bond_yield_10y IS NOT NULL THEN 1 ELSE 0 END) AS bond_rows,
      SUM(CASE WHEN pe_ttm IS NOT NULL AND bond_yield_10y IS NOT NULL THEN 1 ELSE 0 END) AS erp_ready_rows,
      MIN(trade_date) AS min_date,
      MAX(trade_date) AS max_date
    FROM market_snapshots
    WHERE index_code = ?1 AND trade_date BETWEEN ?2 AND ?3
  `).bind(indexCode, startDate, endDate).all();

  const row = (summaryResult.results[0] || {}) as Record<string, number | string | null>;
  const tradeDayCount = Number(row.trade_day_count || 0);
  const erpReadyRows = Number(row.erp_ready_rows || 0);

  return {
    index_code: indexCode,
    start_date: startDate,
    end_date: endDate,
    trade_day_count: tradeDayCount,
    total_rows: Number(row.total_rows || 0),
    close_rows: Number(row.close_rows || 0),
    pe_rows: Number(row.pe_rows || 0),
    bond_rows: Number(row.bond_rows || 0),
    erp_ready_rows: erpReadyRows,
    min_date: (row.min_date as string | null) ?? null,
    max_date: (row.max_date as string | null) ?? null,
    erp_ready_ratio: tradeDayCount > 0
      ? Math.round((erpReadyRows / tradeDayCount) * 1000) / 1000
      : 0,
  };
}

export function buildAuditWarnings(
  beforeAudit: BackfillAuditSummary,
  afterAudit: BackfillAuditSummary,
): string[] {
  const warnings: string[] = [];
  const erpReadyDelta = afterAudit.erp_ready_rows - beforeAudit.erp_ready_rows;
  const peDelta = afterAudit.pe_rows - beforeAudit.pe_rows;
  const bondDelta = afterAudit.bond_rows - beforeAudit.bond_rows;

  if (afterAudit.trade_day_count === 0) {
    warnings.push('No rows found in the requested range after execution.');
    return warnings;
  }

  if (erpReadyDelta <= 0) {
    warnings.push('ERP-ready rows did not increase. Check whether this range was already backfilled or one of the upstream sources failed.');
  }

  if (peDelta <= 0) {
    warnings.push('PE rows did not increase. Verify the csindex valuation source for this range.');
  }

  if (bondDelta <= 0) {
    warnings.push('10Y bond yield rows did not increase. Verify the chinabond source for this range.');
  }

  if (afterAudit.erp_ready_ratio < 0.6) {
    warnings.push(`ERP-ready coverage is low (${(afterAudit.erp_ready_ratio * 100).toFixed(1)}%). Do not trust long-range ERP visuals until completeness improves.`);
  }

  return warnings;
}
