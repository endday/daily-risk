import { describe, expect, it } from 'vitest';
import {
  buildAuditWarnings,
  isIsoDate,
  validateBackfillWindow,
  type BackfillAuditSummary,
} from '../backfill-audit';

function createAuditSummary(overrides: Partial<BackfillAuditSummary> = {}): BackfillAuditSummary {
  return {
    index_code: '000300',
    start_date: '2020-01-01',
    end_date: '2021-12-31',
    trade_day_count: 400,
    total_rows: 400,
    close_rows: 400,
    pe_rows: 400,
    bond_rows: 400,
    erp_ready_rows: 400,
    min_date: '2020-01-02',
    max_date: '2021-12-31',
    erp_ready_ratio: 1,
    ...overrides,
  };
}

describe('backfill audit helpers', () => {
  it('should validate ISO date strings', () => {
    expect(isIsoDate('2026-06-27')).toBe(true);
    expect(isIsoDate('2026/06/27')).toBe(false);
  });

  it('should reject oversized backfill windows', () => {
    const result = validateBackfillWindow('2020-01-01', '2022-12-31', 731);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Date range too large');
  });

  it('should accept a safe backfill window', () => {
    const result = validateBackfillWindow('2020-01-01', '2021-12-31', 731);
    expect(result.ok).toBe(true);
    expect(result.spanDays).toBeGreaterThan(700);
  });

  it('should emit warnings for low ERP completeness', () => {
    const beforeAudit = createAuditSummary({
      pe_rows: 100,
      bond_rows: 80,
      erp_ready_rows: 60,
      erp_ready_ratio: 0.15,
    });
    const afterAudit = createAuditSummary({
      pe_rows: 120,
      bond_rows: 80,
      erp_ready_rows: 60,
      erp_ready_ratio: 0.15,
    });

    const warnings = buildAuditWarnings(beforeAudit, afterAudit);
    expect(warnings.some((item) => item.includes('ERP-ready rows did not increase'))).toBe(true);
    expect(warnings.some((item) => item.includes('10Y bond yield rows did not increase'))).toBe(true);
    expect(warnings.some((item) => item.includes('coverage is low'))).toBe(true);
  });
});
