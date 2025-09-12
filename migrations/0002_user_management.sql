-- Add user management and permissions system

-- Add more fields to users table for better user management
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN full_name TEXT;
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'member'; -- 'super_admin', 'admin', 'moderator', 'member'
ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'; -- 'active', 'inactive', 'suspended'
ALTER TABLE users ADD COLUMN created_by INTEGER;
ALTER TABLE users ADD COLUMN last_login DATETIME;

-- Create permissions table
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create role_permissions junction table
CREATE TABLE IF NOT EXISTS role_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  permission_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (permission_name) REFERENCES permissions(name)
);

-- Insert default permissions
INSERT OR IGNORE INTO permissions (name, description) VALUES 
  ('view_prayers', 'View prayer requests'),
  ('create_prayers', 'Submit new prayer requests'),
  ('suggest_updates', 'Suggest updates to prayer requests'),
  ('manage_users', 'Create and manage user accounts'),
  ('approve_updates', 'Approve or reject prayer updates'),
  ('manage_prayers', 'Edit and delete prayer requests'),
  ('view_admin_panel', 'Access admin panel'),
  ('system_admin', 'Full system administration');

-- Insert default role permissions
INSERT OR IGNORE INTO role_permissions (role, permission_name) VALUES 
  -- Super Admin (full access)
  ('super_admin', 'view_prayers'),
  ('super_admin', 'create_prayers'),
  ('super_admin', 'suggest_updates'),
  ('super_admin', 'manage_users'),
  ('super_admin', 'approve_updates'),
  ('super_admin', 'manage_prayers'),
  ('super_admin', 'view_admin_panel'),
  ('super_admin', 'system_admin'),
  
  -- Admin (most access, no user management)
  ('admin', 'view_prayers'),
  ('admin', 'create_prayers'),
  ('admin', 'suggest_updates'),
  ('admin', 'approve_updates'),
  ('admin', 'manage_prayers'),
  ('admin', 'view_admin_panel'),
  
  -- Moderator (can approve updates)
  ('moderator', 'view_prayers'),
  ('moderator', 'create_prayers'),
  ('moderator', 'suggest_updates'),
  ('moderator', 'approve_updates'),
  
  -- Member (basic access)
  ('member', 'view_prayers'),
  ('member', 'create_prayers'),
  ('member', 'suggest_updates');

-- Update existing admin user to super_admin with full info
UPDATE users 
SET role = 'super_admin', 
    full_name = 'System Administrator',
    email = 'admin@bynechurch.org',
    status = 'active'
WHERE username = 'admin';

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);