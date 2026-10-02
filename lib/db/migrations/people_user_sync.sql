-- Migração ADITIVA. Aplicar antes de PEOPLE_USER_SYNC_ENABLED=true.
CREATE TABLE IF NOT EXISTS people_sync_sessions (
  id uuid PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  encrypted_token text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS people_sync_sessions_expires_idx ON people_sync_sessions(expires_at);