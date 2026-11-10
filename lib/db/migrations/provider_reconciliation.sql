-- Additive migration. No identities are inferred or rebound by this migration.
ALTER TABLE providers ADD COLUMN IF NOT EXISTS local_reference text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'providers'::regclass
      AND conname = 'providers_local_reference_unique'
  ) THEN
    IF to_regclass('providers_local_reference_unique') IS NOT NULL THEN
      ALTER TABLE providers ADD CONSTRAINT providers_local_reference_unique
        UNIQUE USING INDEX providers_local_reference_unique;
    ELSE
      ALTER TABLE providers ADD CONSTRAINT providers_local_reference_unique
        UNIQUE (local_reference);
    END IF;
  END IF;
END $$;
