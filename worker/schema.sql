-- Ask-your-instructor: classes, students, questions; plus problem reports and rate-limit hits.
-- No accounts: keys are random secrets held on each device; only their SHA-256 is stored.
-- This is the full current schema (fresh databases). Production changes go in migrations/ as additive-only files.
CREATE TABLE IF NOT EXISTS classes (
  code TEXT PRIMARY KEY,            -- 6-char join code, e.g. K7Q2PX
  name TEXT NOT NULL,
  instructor TEXT NOT NULL,
  admin_hash TEXT NOT NULL,         -- sha256 of the instructor's hub key
  created INTEGER NOT NULL,
  inorm TEXT,                       -- instructor name normalised (lowercase, letters/digits only), for the same-name check
  verified INTEGER NOT NULL DEFAULT 0,  -- 1 = "Verified instructor" mark; set by hand with wrangler only
  owner INTEGER NOT NULL DEFAULT 0      -- 1 = the app owner's class; its hub shows problem reports; set by hand only
);
CREATE INDEX IF NOT EXISTS c_inorm ON classes(inorm);
CREATE TABLE IF NOT EXISTS students (
  sid TEXT PRIMARY KEY,
  code TEXT NOT NULL REFERENCES classes(code),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS s_code ON students(code, created);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL REFERENCES classes(code),
  sid TEXT NOT NULL REFERENCES students(sid),
  topic TEXT,                       -- lesson topic id, e.g. thy-da
  qid TEXT,                         -- practice question id, e.g. DAC-002
  picked INTEGER,                   -- the student's answer to qid (0-2), if any
  text TEXT NOT NULL,
  created INTEGER NOT NULL,
  answer TEXT,
  answered INTEGER,
  seen INTEGER NOT NULL DEFAULT 0,  -- student has seen the answer
  draft TEXT                        -- suggested answer (e.g. by a Claude watchdog); shown only in the hub, never to students
);
CREATE INDEX IF NOT EXISTS q_code ON questions(code, created);
CREATE INDEX IF NOT EXISTS q_sid ON questions(sid, created);
CREATE TABLE IF NOT EXISTS push_subs (   -- phone notifications when the instructor answers (added 2026-10-21, migrations/2026-10-21-push.sql)
  endpoint TEXT PRIMARY KEY,        -- the browser's push-service URL (one row per browser)
  sid TEXT NOT NULL REFERENCES students(sid) ON DELETE CASCADE,
  code TEXT NOT NULL,
  p256dh TEXT NOT NULL,             -- the browser's public key, base64url (65 bytes)
  auth TEXT NOT NULL,               -- the browser's auth secret, base64url (16 bytes)
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ps_sid ON push_subs(sid);
CREATE TABLE IF NOT EXISTS reports (  -- anonymous "something is wrong" reports; nothing identifies the sender
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,                -- q:DAC-002 · lesson:thy-da · card:<id>
  kind TEXT NOT NULL,               -- wrong · confusing · typo · other
  text TEXT,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS r_created ON reports(created);
CREATE TABLE IF NOT EXISTS meta (     -- k='salt': random value for hashing IPs, created once by the Worker
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS hits (     -- rate-limit log; who = sha256(salt|IP), never the IP; pruned after 2 days
  bucket TEXT NOT NULL,             -- class · join · report
  who TEXT NOT NULL,
  t INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS h_who ON hits(bucket, who, t);
CREATE INDEX IF NOT EXISTS h_t ON hits(t);
-- accounts (added 2026-10-22, migrations/2026-10-22-accounts.sql)
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
