import { backfillSnapshots } from '../src/collectors/backfill';
import {
  buildAuditWarnings,
  getBackfillAuditSummary,
  validateBackfillWindow,
} from '../src/backfill-audit';

type RemoteEnv = {
  DB: D1Database;
};

export default {
  async fetch(request: Request, env: RemoteEnv): Promise<Response> {
    try {
      const url = new URL(request.url);
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const indexCode = url.searchParams.get('indexCode') || '000300';
      const auditOnly = url.searchParams.get('audit') === '1';

      if (!startDate || !endDate) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'Missing startDate or endDate',
        }, null, 2), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const validation = validateBackfillWindow(startDate, endDate);
      if (!validation.ok) {
        return new Response(JSON.stringify({
          ok: false,
          error: validation.error,
        }, null, 2), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const beforeAudit = await getBackfillAuditSummary(env.DB, startDate, endDate, indexCode);

      if (auditOnly) {
        return new Response(JSON.stringify({
          ok: true,
          mode: 'audit',
          spanDays: validation.spanDays,
          audit: beforeAudit,
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const result = await backfillSnapshots(env.DB, startDate, endDate);
      const afterAudit = await getBackfillAuditSummary(env.DB, startDate, endDate, indexCode);
      const auditWarnings = buildAuditWarnings(beforeAudit, afterAudit);

      return new Response(JSON.stringify({
        ok: true,
        startDate,
        endDate,
        spanDays: validation.spanDays,
        beforeAudit,
        afterAudit,
        auditWarnings,
        ...result,
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      return new Response(JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }, null, 2), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
