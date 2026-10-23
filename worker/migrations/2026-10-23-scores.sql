-- Scores to the instructor (2026-10-23): practice-test scores a student chooses to send, and the instructor's "how much do I see" setting.
-- ADDITIVE ONLY: two new columns with defaults and one new table. Safe on the live database; old clients keep working.
-- Apply ONCE, before deploying the new worker.js (the new code reads these columns and this table):
--   npx wrangler@4 d1 execute balloon-prep-qa --remote --file migrations/2026-10-23-scores.sql
-- (ALTER TABLE ADD COLUMN is not idempotent in SQLite: a second run stops at "duplicate column name" and changes nothing.)
ALTER TABLE classes ADD COLUMN score_view TEXT NOT NULL DEFAULT 'all';
ALTER TABLE classes ADD COLUMN scores_seen INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL REFERENCES classes(code),
  sid TEXT NOT NULL REFERENCES students(sid),
  track TEXT NOT NULL,
  n INTEGER NOT NULL,
  r INTEGER NOT NULL,
  pct INTEGER NOT NULL,
  pass INTEGER NOT NULL,
  sec INTEGER NOT NULL,
  areas TEXT NOT NULL,
  flags TEXT,
  taken INTEGER NOT NULL,
  created INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sc_once ON scores(sid, taken);
CREATE INDEX IF NOT EXISTS sc_code ON scores(code, created);
