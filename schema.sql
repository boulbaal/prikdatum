CREATE TABLE IF NOT EXISTS polls (
  id          TEXT PRIMARY KEY,          -- 10 tekens, [a-z0-9], willekeurig
  title       TEXT NOT NULL,             -- max 80 tekens, getrimd
  final_option_id TEXT,                  -- NULL of id van de definitieve optie
  visits      INTEGER NOT NULL DEFAULT 0,-- aantal keren dat de pagina bezocht is
  created_at  TEXT NOT NULL              -- ISO-8601 UTC
);

CREATE TABLE IF NOT EXISTS options (
  id          TEXT PRIMARY KEY,          -- 10 tekens
  poll_id     TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,             -- 'YYYY-MM-DD'
  time        TEXT,                      -- 'HH:MM' of NULL (= hele dag / nog geen uur)
  added_by    TEXT NOT NULL,             -- participants.id
  created_at  TEXT NOT NULL,
  UNIQUE (poll_id, date)                 -- één rij per dag; het uur hangt aan de dag
);

CREATE TABLE IF NOT EXISTS participants (
  id          TEXT PRIMARY KEY,          -- 10 tekens
  poll_id     TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,             -- zoals getypt, getrimd, max 40
  name_key    TEXT NOT NULL,             -- genormaliseerd: lowercase, meervoudige spaties -> 1
  created_at  TEXT NOT NULL,
  UNIQUE (poll_id, name_key)
);

CREATE TABLE IF NOT EXISTS votes (
  participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  option_id      TEXT NOT NULL REFERENCES options(id) ON DELETE CASCADE,
  PRIMARY KEY (participant_id, option_id)
);

CREATE INDEX IF NOT EXISTS idx_options_poll ON options(poll_id);
CREATE INDEX IF NOT EXISTS idx_participants_poll ON participants(poll_id);

-- Voor databases die nog met het oude schema (uniek per dag+uur) zijn aangemaakt:
-- deze index dwingt "één rij per dag" ook daar af, zonder iets te verwijderen.
CREATE UNIQUE INDEX IF NOT EXISTS idx_options_dag ON options(poll_id, date);
