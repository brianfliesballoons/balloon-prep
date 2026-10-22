-- Optional student accounts (sign in with a passkey, an emailed code, or Google) so study progress follows the student.
-- Additive only. Apply before deploying the Worker that uses it.
CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  eh TEXT UNIQUE,                   -- sha256('email|'+salt+'|'+lowercased email); the address itself is never stored
  gsub TEXT UNIQUE,                 -- Google account id (sub), if they used Google
  created INTEGER NOT NULL,
  prog TEXT,                        -- the study progress JSON (no instructor hub keys, no push subscription)
  ver INTEGER NOT NULL DEFAULT 0,   -- bumped on every save; a save must name the version it started from
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  th TEXT PRIMARY KEY,              -- sha256 of the session token held by the device
  uid TEXT NOT NULL REFERENCES users(uid),
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS se_uid ON sessions(uid);
CREATE TABLE IF NOT EXISTS passkeys (
  cid TEXT PRIMARY KEY,             -- credential id, base64url
  uid TEXT NOT NULL REFERENCES users(uid),
  jwk TEXT NOT NULL,                -- public key
  alg INTEGER NOT NULL,             -- -7 ES256, -257 RS256
  created INTEGER NOT NULL,
  used INTEGER
);
CREATE INDEX IF NOT EXISTS pk_uid ON passkeys(uid);
CREATE TABLE IF NOT EXISTS chal (     -- passkey challenges, single use, 5 minutes
  id TEXT PRIMARY KEY,
  ch TEXT NOT NULL,
  kind TEXT NOT NULL,               -- create · get
  uid TEXT,
  exp INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_codes (
  eh TEXT PRIMARY KEY,
  ch TEXT NOT NULL,                 -- sha256(eh|code)
  exp INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  sent INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ghand (    -- a Google sign-in on its way back to the app, 15 minutes
  h TEXT PRIMARY KEY,               -- sha256 of the hand-off id the app polls with
  st TEXT NOT NULL UNIQUE,          -- OAuth state sent to Google
  ver TEXT NOT NULL,                -- PKCE verifier
  kind TEXT NOT NULL,               -- login · gmail (one-time setup of the app's own sender)
  exp INTEGER NOT NULL,
  done INTEGER NOT NULL DEFAULT 0,
  tok TEXT,                         -- the new session token, until the app picks it up (then the row is deleted)
  net TEXT,                         -- hash of the network that finished, for the automatic hand-over
  ch TEXT,                          -- sha256(h|fallback code)
  tries INTEGER NOT NULL DEFAULT 0,
  isnew INTEGER,
  email TEXT                        -- shown once to the app ("Signed in as ..."), deleted with the row
);
