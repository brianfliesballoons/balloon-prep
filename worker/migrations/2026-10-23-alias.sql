-- Easy word code a student can type instead of the 6-character class code. Set by hand: UPDATE classes SET alias='WORD' WHERE code='XXXXXX';
ALTER TABLE classes ADD COLUMN alias TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS c_alias ON classes(alias);
