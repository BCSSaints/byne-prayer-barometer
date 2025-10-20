-- Add support for category changes in suggested updates

-- Add suggested_category column to suggested_updates table
ALTER TABLE suggested_updates ADD COLUMN suggested_category TEXT;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_suggested_updates_suggested_category ON suggested_updates(suggested_category);
