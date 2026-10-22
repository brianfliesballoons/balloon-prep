-- Round 2 (2026-10-21): rate limits, same-name check, verified/owner marks, problem reports, answer drafts, student deletion.
-- ADDITIVE ONLY: new columns with defaults and new tables. Safe on the live database; old clients keep working.
-- Apply ONCE, before deploying the new worker.js (the new code reads these columns):
--   npx wrangler@4 d1 execute balloon-prep-qa --remote --file migrations/2026-10-21-round2.sql
-- (ALTER TABLE ADD COLUMN is not idempotent in SQLite: a second run stops at "duplicate column name" and changes nothing.)
ALTER TABLE classes ADD COLUMN inorm TEXT;
ALTER TABLE classes ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE classes ADD COLUMN owner INTEGER NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN draft TEXT;
CREATE INDEX IF NOT EXISTS c_inorm ON classes(inorm);
CREATE INDEX IF NOT EXISTS s_code ON students(code, created);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  kind TEXT NOT NULL,
  text TEXT,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS r_created ON reports(created);
CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hits (
  bucket TEXT NOT NULL,
  who TEXT NOT NULL,
  t INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS h_who ON hits(bucket, who, t);
CREATE INDEX IF NOT EXISTS h_t ON hits(t);
