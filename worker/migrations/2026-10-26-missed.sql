-- Past tests + missed questions (2026-10-26): a sent score can carry the questions the student missed with the answer they picked,
-- and how many were skipped (not answered) out of how many the test had. Only when the student ticks "Include the questions I missed".
-- ADDITIVE ONLY: three nullable columns. Old rows keep NULL and render exactly as before; the old Worker ignores them.
-- Apply ONCE, before deploying the new worker.js (the new code writes and reads these columns):
--   npx wrangler@4 d1 execute balloon-prep-qa --remote --file migrations/2026-10-26-missed.sql
-- (ALTER TABLE ADD COLUMN is not idempotent in SQLite: a second run stops at "duplicate column name" and changes nothing.)
ALTER TABLE scores ADD COLUMN missed TEXT;
ALTER TABLE scores ADD COLUMN skipped INTEGER;
ALTER TABLE scores ADD COLUMN of_n INTEGER;
