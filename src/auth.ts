// Authentication utilities
import bcrypt from 'bcryptjs';
import { getCookie } from 'hono/cookie';
import { CloudflareBindings, User, Session } from './types';

export class AuthService {
  constructor(private db: D1Database) {}

  // Hash password
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 12);
  }

  // Verify password
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  // Generate session ID
  static generateSessionId(): string {
    return crypto.randomUUID();
  }

  // Authenticate user
  async authenticateUser(username: string, password: string): Promise<User | null> {
    try {
      const user = await this.db
        .prepare('SELECT id, username, password_hash, is_admin, created_at FROM users WHERE username = ?')
        .bind(username)
        .first() as any;

      if (!user) {
        console.log('User not found:', username);
        return null;
      }

      const isValid = await AuthService.verifyPassword(password, user.password_hash);
      if (!isValid) {
        console.log('Password verification failed for user:', username);
        return null;
      }

      return {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin === 1,
        created_at: user.created_at
      };
    } catch (error) {
      console.error('Authentication error:', error);
      return null;
    }
  }

  // Create session
  async createSession(userId: number): Promise<string> {
    const sessionId = AuthService.generateSessionId();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await this.db
      .prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)')
      .bind(sessionId, userId, expiresAt.toISOString())
      .run();

    return sessionId;
  }

  // Get user by session
  async getUserBySession(sessionId: string): Promise<User | null> {
    if (!sessionId) return null;

    const result = await this.db
      .prepare(`
        SELECT u.id, u.username, u.is_admin, u.created_at 
        FROM users u 
        JOIN sessions s ON u.id = s.user_id 
        WHERE s.id = ? AND s.expires_at > datetime('now')
      `)
      .bind(sessionId)
      .first() as any;

    if (!result) return null;

    return {
      id: result.id,
      username: result.username,
      is_admin: result.is_admin === 1,
      created_at: result.created_at
    };
  }

  // Delete session
  async deleteSession(sessionId: string): Promise<void> {
    await this.db
      .prepare('DELETE FROM sessions WHERE id = ?')
      .bind(sessionId)
      .run();
  }

  // Clean up expired sessions
  async cleanupExpiredSessions(): Promise<void> {
    await this.db
      .prepare('DELETE FROM sessions WHERE expires_at < datetime("now")')
      .run();
  }
}

// Middleware to check authentication
export const requireAuth = async (c: any, next: any) => {
  const sessionId = getCookie(c, 'session_id');
  const authService = new AuthService(c.env.DB);
  const user = await authService.getUserBySession(sessionId);

  if (!user) {
    return c.redirect('/login');
  }

  c.set('user', user);
  await next();
};

// Middleware to check admin privileges
export const requireAdmin = async (c: any, next: any) => {
  const user = c.get('user');
  
  if (!user || !user.is_admin) {
    return c.html(`
      <html>
        <head><title>Access Denied</title></head>
        <body>
          <h1>Access Denied</h1>
          <p>You need administrator privileges to access this page.</p>
          <a href="/">Back to Home</a>
        </body>
      </html>
    `, 403);
  }

  await next();
};