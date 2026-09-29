DROP TABLE IF EXISTS snippets;

CREATE TABLE IF NOT EXISTS vault_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  parent_id TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'FILE',
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data TEXT NOT NULL, -- Base64 data URL; folders store an empty string
  timestamp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS vault_files_user_created
  ON vault_files (user_id, created_at DESC);
