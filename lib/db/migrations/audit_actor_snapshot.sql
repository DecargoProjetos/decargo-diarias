-- Additive and idempotent. Never backfill historical names from users.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_name_at_action text;
