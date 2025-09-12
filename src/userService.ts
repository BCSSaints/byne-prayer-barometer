// User management service
import { User, Permission, CreateUserForm } from './types';
import { AuthService } from './auth';

export class UserService {
  constructor(private db: D1Database) {}

  // Get all users with pagination
  async getAllUsers(limit: number = 50, offset: number = 0): Promise<User[]> {
    const results = await this.db
      .prepare(`
        SELECT id, username, email, full_name, role, status, 
               (CASE WHEN role IN ('super_admin', 'admin') THEN 1 ELSE 0 END) as is_admin,
               created_by, last_login, created_at 
        FROM users 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `)
      .bind(limit, offset)
      .all();

    return results.results as User[];
  }

  // Get user by ID
  async getUserById(id: number): Promise<User | null> {
    const result = await this.db
      .prepare(`
        SELECT id, username, email, full_name, role, status, 
               (CASE WHEN role IN ('super_admin', 'admin') THEN 1 ELSE 0 END) as is_admin,
               created_by, last_login, created_at 
        FROM users 
        WHERE id = ?
      `)
      .bind(id)
      .first();

    return result as User | null;
  }

  // Create new user
  async createUser(userData: CreateUserForm, createdById: number): Promise<number> {
    const passwordHash = await AuthService.hashPassword(userData.password);
    
    const result = await this.db
      .prepare(`
        INSERT INTO users (username, password_hash, email, full_name, role, status, created_by) 
        VALUES (?, ?, ?, ?, ?, 'active', ?)
      `)
      .bind(
        userData.username, 
        passwordHash, 
        userData.email, 
        userData.full_name, 
        userData.role, 
        createdById
      )
      .run();

    return result.meta.last_row_id as number;
  }

  // Update user
  async updateUser(id: number, updates: Partial<User>): Promise<void> {
    const fields = [];
    const values = [];

    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.full_name !== undefined) {
      fields.push('full_name = ?');
      values.push(updates.full_name);
    }
    if (updates.role !== undefined) {
      fields.push('role = ?');
      values.push(updates.role);
    }
    if (updates.status !== undefined) {
      fields.push('status = ?');
      values.push(updates.status);
    }

    if (fields.length === 0) return;

    values.push(id);

    await this.db
      .prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();
  }

  // Delete user (soft delete by setting status to inactive)
  async deleteUser(id: number): Promise<void> {
    await this.db
      .prepare('UPDATE users SET status = ? WHERE id = ?')
      .bind('inactive', id)
      .run();
  }

  // Check if user has permission
  async userHasPermission(userId: number, permission: string): Promise<boolean> {
    const user = await this.getUserById(userId);
    if (!user) return false;

    const result = await this.db
      .prepare(`
        SELECT COUNT(*) as count 
        FROM role_permissions 
        WHERE role = ? AND permission_name = ?
      `)
      .bind(user.role, permission)
      .first() as any;

    return result.count > 0;
  }

  // Get all permissions for a role
  async getRolePermissions(role: string): Promise<Permission[]> {
    const results = await this.db
      .prepare(`
        SELECT p.id, p.name, p.description, p.created_at
        FROM permissions p
        JOIN role_permissions rp ON p.name = rp.permission_name
        WHERE rp.role = ?
      `)
      .bind(role)
      .all();

    return results.results as Permission[];
  }

  // Get all available permissions
  async getAllPermissions(): Promise<Permission[]> {
    const results = await this.db
      .prepare('SELECT id, name, description, created_at FROM permissions ORDER BY name')
      .all();

    return results.results as Permission[];
  }

  // Update last login time
  async updateLastLogin(userId: number): Promise<void> {
    await this.db
      .prepare('UPDATE users SET last_login = datetime("now") WHERE id = ?')
      .bind(userId)
      .run();
  }

  // Get user statistics
  async getUserStats(): Promise<any> {
    const totalUsers = await this.db
      .prepare('SELECT COUNT(*) as count FROM users WHERE status = "active"')
      .first() as any;

    const roleStats = await this.db
      .prepare(`
        SELECT role, COUNT(*) as count 
        FROM users 
        WHERE status = 'active' 
        GROUP BY role
      `)
      .all();

    return {
      total: totalUsers.count,
      byRole: roleStats.results
    };
  }
}