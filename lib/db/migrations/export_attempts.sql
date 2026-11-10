CREATE TABLE IF NOT EXISTS export_attempts (
  integration_ref text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS export_attempts_created_at_idx ON export_attempts (created_at DESC);
