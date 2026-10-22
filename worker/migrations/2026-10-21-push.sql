-- 2026-10-21: phone notifications when the instructor answers. Additive only; safe to run twice.
-- Apply: npx wrangler@4 d1 execute balloon-prep-qa --remote --file worker/migrations/2026-10-21-push.sql --config worker/wrangler.toml
CREATE TABLE IF NOT EXISTS push_subs (
  endpoint TEXT PRIMARY KEY,        -- the browser's push-service URL (one row per browser)
  sid TEXT NOT NULL REFERENCES students(sid) ON DELETE CASCADE,
  code TEXT NOT NULL,
  p256dh TEXT NOT NULL,             -- the browser's public key, base64url (65 bytes)
  auth TEXT NOT NULL,               -- the browser's auth secret, base64url (16 bytes)
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ps_sid ON push_subs(sid);
