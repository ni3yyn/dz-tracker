-- Add logo_url column to merchants table
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS logo_url TEXT DEFAULT NULL;

-- Index (optional — for future filtering)
CREATE INDEX IF NOT EXISTS idx_merchants_logo_url
  ON merchants (id)
  WHERE logo_url IS NOT NULL;

