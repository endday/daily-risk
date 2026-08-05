CREATE TABLE IF NOT EXISTS provider_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  run_type TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  events_upserted INTEGER DEFAULT 0,
  error TEXT
);

ALTER TABLE provider_runs ADD COLUMN records_upserted INTEGER NOT NULL DEFAULT 0;

UPDATE provider_runs
SET records_upserted = events_upserted
WHERE records_upserted = 0 AND events_upserted > 0;

CREATE INDEX IF NOT EXISTS idx_provider_runs_provider_id
  ON provider_runs(provider, id DESC);
