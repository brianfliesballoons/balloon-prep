-- Ask-your-instructor: classes, students, questions. No accounts: keys are random secrets held on each device; only their SHA-256 is stored.
CREATE TABLE IF NOT EXISTS classes (
  code TEXT PRIMARY KEY,            -- 6-char join code, e.g. K7Q2PX
  name TEXT NOT NULL,
  instructor TEXT NOT NULL,
  admin_hash TEXT NOT NULL,         -- sha256 of the instructor's hub key
  created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  sid TEXT PRIMARY KEY,
  code TEXT NOT NULL REFERENCES classes(code),
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created INTEGER NOT NULL
);
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
  seen INTEGER NOT NULL DEFAULT 0   -- student has seen the answer
);
CREATE INDEX IF NOT EXISTS q_code ON questions(code, created);
CREATE INDEX IF NOT EXISTS q_sid ON questions(sid, created);
