-- Insert default admin user
-- Default password: "admin123" (hashed with bcrypt)
-- You should change this after first login
INSERT OR IGNORE INTO users (username, password_hash, is_admin) VALUES 
  ('admin', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LeyshoD9JjlojzWM6', 1);

-- Insert sample prayer requests for demonstration
INSERT OR IGNORE INTO prayer_requests (title, content, requester_name, submitted_by) VALUES 
  ('Healing for Sarah', 'Please pray for Sarah who is recovering from surgery. Pray for quick healing and strength.', 'Mary Johnson', 1),
  ('Job Search', 'Seeking employment after recent job loss. Praying for guidance and open doors.', 'Anonymous', 1),
  ('Family Unity', 'Pray for reconciliation within our family during this difficult time.', 'John Smith', 1),
  ('Mission Trip', 'Pray for our upcoming mission trip to Guatemala. Safety and fruitful ministry.', 'Youth Group', 1);

-- Insert sample suggested updates
INSERT OR IGNORE INTO suggested_updates (prayer_request_id, suggested_by, suggested_content) VALUES 
  (1, 1, 'Sarah is doing much better! Surgery was successful and she is now home recovering.'),
  (2, 1, 'Update: Found a promising job opportunity. Interview is scheduled for next week.');