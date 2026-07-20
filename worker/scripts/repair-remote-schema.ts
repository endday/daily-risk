type RemoteEnv = {
  DB: D1Database;
};

type ColumnInfo = {
  name: string;
  type: string;
};

const REQUIRED_MARKET_SNAPSHOT_COLUMNS: ColumnInfo[] = [
  { name: 'us_2y_yield', type: 'REAL' },
  { name: 'fed_funds_rate', type: 'REAL' },
  { name: 'usd_index', type: 'REAL' },
  { name: 'oil_wti', type: 'REAL' },
  { name: 'us_yield_spread', type: 'REAL' },
  { name: 'total_market_cap', type: 'REAL' },
];

const REQUIRED_INDEXES = [
  {
    name: 'idx_snapshots_index_code_date',
    sql: 'CREATE INDEX IF NOT EXISTS idx_snapshots_index_code_date ON market_snapshots(index_code, trade_date)',
  },
];

async function getColumns(db: D1Database, tableName: string): Promise<string[]> {
  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all();
  return result.results.map((row: any) => row.name);
}

async function getIndexes(db: D1Database, tableName: string): Promise<string[]> {
  const result = await db.prepare(`PRAGMA index_list('${tableName}')`).all();
  return result.results.map((row: any) => row.name);
}

async function ensureMarketSnapshotColumns(db: D1Database): Promise<string[]> {
  const existingColumns = await getColumns(db, 'market_snapshots');
  const applied: string[] = [];

  for (const column of REQUIRED_MARKET_SNAPSHOT_COLUMNS) {
    if (existingColumns.includes(column.name)) continue;
    await db.prepare(`ALTER TABLE market_snapshots ADD COLUMN ${column.name} ${column.type}`).run();
    applied.push(`column:${column.name}`);
  }

  return applied;
}

async function ensureMarketSnapshotIndexes(db: D1Database): Promise<string[]> {
  const existingIndexes = await getIndexes(db, 'market_snapshots');
  const applied: string[] = [];

  for (const index of REQUIRED_INDEXES) {
    if (existingIndexes.includes(index.name)) continue;
    await db.prepare(index.sql).run();
    applied.push(`index:${index.name}`);
  }

  return applied;
}

async function collectAudit(db: D1Database) {
  const columns = await getColumns(db, 'market_snapshots');
  const indexes = await getIndexes(db, 'market_snapshots');
  const missingColumns = REQUIRED_MARKET_SNAPSHOT_COLUMNS
    .map((column) => column.name)
    .filter((name) => !columns.includes(name));
  const missingIndexes = REQUIRED_INDEXES
    .map((index) => index.name)
    .filter((name) => !indexes.includes(name));

  return {
    columns,
    indexes,
    missingColumns,
    missingIndexes,
    needsRepair: missingColumns.length > 0 || missingIndexes.length > 0,
  };
}

export default {
  async fetch(request: Request, env: RemoteEnv): Promise<Response> {
    const url = new URL(request.url);
    const apply = url.searchParams.get('apply') === '1';

    const before = await collectAudit(env.DB);

    if (!apply) {
      return new Response(JSON.stringify({
        ok: true,
        mode: 'audit',
        before,
      }, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const appliedColumns = await ensureMarketSnapshotColumns(env.DB);
    const appliedIndexes = await ensureMarketSnapshotIndexes(env.DB);
    const after = await collectAudit(env.DB);

    return new Response(JSON.stringify({
      ok: true,
      mode: 'repair',
      applied: [...appliedColumns, ...appliedIndexes],
      before,
      after,
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' },
    });
  },
};
