DROP TABLE IF EXISTS snippets;

CREATE TABLE IF NOT EXISTS vault_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  data TEXT NOT NULL, -- Will store the Base64 Data URL
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS vault_files_user_created
  ON vault_files (user_id, created_at DESC);
