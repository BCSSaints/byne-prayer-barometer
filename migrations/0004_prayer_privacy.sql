-- Add privacy option to prayer requests

-- Add is_private column to prayer_requests table
ALTER TABLE prayer_requests ADD COLUMN is_private BOOLEAN DEFAULT 0;

-- Create index for better performance when filtering by privacy
CREATE INDEX IF NOT EXISTS idx_prayer_requests_is_private ON prayer_requests(is_private);