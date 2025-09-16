-- Add email field and support for guest submissions

-- Add email field to prayer_requests
ALTER TABLE prayer_requests ADD COLUMN requester_email TEXT;

-- Allow submitted_by to be NULL for guest submissions
-- (This is already supported in SQLite, but we document it here)

-- Create index for email lookups (optional but helpful)
CREATE INDEX IF NOT EXISTS idx_prayer_requests_email ON prayer_requests(requester_email);