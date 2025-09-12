-- Add categories and enhanced features to prayer requests

-- Add category column to prayer_requests table
ALTER TABLE prayer_requests ADD COLUMN category TEXT DEFAULT 'Prayer Need';

-- Create categories table for managing available categories
CREATE TABLE IF NOT EXISTS prayer_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3B82F6', -- Default blue color
  icon TEXT DEFAULT 'fas fa-praying-hands', -- FontAwesome icon class
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default categories with colors and icons
INSERT OR IGNORE INTO prayer_categories (name, description, color, icon, sort_order) VALUES 
  ('Praise Report', 'Answered prayers and celebrations', '#10B981', 'fas fa-heart', 1),
  ('Hospital Need', 'Immediate medical care and hospital visits', '#EF4444', 'fas fa-hospital', 2),
  ('Health Need', 'General health concerns and healing requests', '#F59E0B', 'fas fa-heartbeat', 3),
  ('Prayer Need', 'General prayer requests and spiritual needs', '#3B82F6', 'fas fa-praying-hands', 4),
  ('Long-Term Need', 'Ongoing situations requiring sustained prayer', '#8B5CF6', 'fas fa-calendar-alt', 5),
  ('College Student', 'Students in college or university', '#06B6D4', 'fas fa-graduation-cap', 6),
  ('Military', 'Active duty military and veterans', '#059669', 'fas fa-shield-alt', 7),
  ('Ministry Partner', 'Missionaries and ministry workers', '#DC2626', 'fas fa-globe', 8);

-- Update existing prayer requests to have default category
UPDATE prayer_requests SET category = 'Prayer Need' WHERE category IS NULL;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_prayer_requests_category ON prayer_requests(category);
CREATE INDEX IF NOT EXISTS idx_prayer_requests_created_at_desc ON prayer_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_suggested_updates_created_at_desc ON suggested_updates(created_at DESC);

-- Create import_logs table to track spreadsheet imports
CREATE TABLE IF NOT EXISTS import_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  imported_by INTEGER NOT NULL,
  filename TEXT,
  records_imported INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  import_notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (imported_by) REFERENCES users(id)
);