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
