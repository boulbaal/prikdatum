-- Levenscyclus: laatste activiteit per afspraak (voor opruimen na 12 maanden zonder activiteit)
-- en "zacht" verwijderde deelnemers (30 dagen zichtbaar als info: "iemand heeft X weggehaald").
-- Draaien op een bestaande database: npx wrangler d1 execute prikdatum --remote --file=migrations/0002_levenscyclus.sql
ALTER TABLE polls ADD COLUMN last_activity_at TEXT;
UPDATE polls SET last_activity_at = created_at WHERE last_activity_at IS NULL;
ALTER TABLE participants ADD COLUMN deleted_at TEXT;
CREATE INDEX IF NOT EXISTS idx_polls_activity ON polls(last_activity_at);
CREATE INDEX IF NOT EXISTS idx_participants_deleted ON participants(deleted_at);
