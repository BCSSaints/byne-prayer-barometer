// Database service for Prayer App
import { PrayerRequest, SuggestedUpdate, PrayerRequestForm, SuggestedUpdateForm } from './types';

export class PrayerService {
  constructor(private db: D1Database) {}

  // Get all active prayer requests with optional category filter
  async getAllPrayerRequests(category?: string): Promise<PrayerRequest[]> {
    let query = `
      SELECT id, title, content, requester_name, submitted_by, category, status, 
             created_at, updated_at 
      FROM prayer_requests 
      WHERE status != 'archived'
    `;
    
    const params = [];
    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }
    
    query += ' ORDER BY created_at DESC';

    const results = await this.db
      .prepare(query)
      .bind(...params)
      .all();

    return results.results as PrayerRequest[];
  }

  // Get prayer request by ID
  async getPrayerRequestById(id: number): Promise<PrayerRequest | null> {
    const result = await this.db
      .prepare(`
        SELECT id, title, content, requester_name, submitted_by, category, status, 
               created_at, updated_at 
        FROM prayer_requests 
        WHERE id = ?
      `)
      .bind(id)
      .first();

    return result as PrayerRequest | null;
  }

  // Create new prayer request
  async createPrayerRequest(data: PrayerRequestForm, userId: number): Promise<number> {
    const result = await this.db
      .prepare(`
        INSERT INTO prayer_requests (title, content, requester_name, category, submitted_by) 
        VALUES (?, ?, ?, ?, ?)
      `)
      .bind(data.title, data.content, data.requester_name, data.category, userId)
      .run();

    return result.meta.last_row_id as number;
  }

  // Update prayer request status
  async updatePrayerRequestStatus(id: number, status: string): Promise<void> {
    await this.db
      .prepare(`
        UPDATE prayer_requests 
        SET status = ?, updated_at = datetime('now') 
        WHERE id = ?
      `)
      .bind(status, id)
      .run();
  }

  // Get suggested updates for a prayer request
  async getSuggestedUpdatesForPrayer(prayerRequestId: number): Promise<SuggestedUpdate[]> {
    const results = await this.db
      .prepare(`
        SELECT su.*, u.username as suggested_by_username
        FROM suggested_updates su
        JOIN users u ON su.suggested_by = u.id
        WHERE su.prayer_request_id = ?
        ORDER BY su.created_at DESC
      `)
      .bind(prayerRequestId)
      .all();

    return results.results as SuggestedUpdate[];
  }

  // Create suggested update
  async createSuggestedUpdate(prayerRequestId: number, data: SuggestedUpdateForm, userId: number): Promise<number> {
    const result = await this.db
      .prepare(`
        INSERT INTO suggested_updates (prayer_request_id, suggested_by, suggested_content) 
        VALUES (?, ?, ?)
      `)
      .bind(prayerRequestId, userId, data.suggested_content)
      .run();

    return result.meta.last_row_id as number;
  }

  // Get all pending suggested updates (for admin)
  async getPendingSuggestedUpdates(): Promise<any[]> {
    const results = await this.db
      .prepare(`
        SELECT 
          su.id, 
          su.prayer_request_id, 
          su.suggested_content, 
          su.created_at,
          pr.title as prayer_title,
          u.username as suggested_by_username
        FROM suggested_updates su
        JOIN prayer_requests pr ON su.prayer_request_id = pr.id
        JOIN users u ON su.suggested_by = u.id
        WHERE su.status = 'pending'
        ORDER BY su.created_at ASC
      `)
      .all();

    return results.results as any[];
  }

  // Approve suggested update
  async approveSuggestedUpdate(updateId: number, adminId: number, adminNotes?: string): Promise<void> {
    await this.db
      .prepare(`
        UPDATE suggested_updates 
        SET status = 'approved', 
            reviewed_by = ?, 
            reviewed_at = datetime('now'),
            admin_notes = ?
        WHERE id = ?
      `)
      .bind(adminId, adminNotes || '', updateId)
      .run();

    // Also update the prayer request's updated_at timestamp
    const update = await this.db
      .prepare('SELECT prayer_request_id FROM suggested_updates WHERE id = ?')
      .bind(updateId)
      .first() as any;

    if (update) {
      await this.db
        .prepare(`
          UPDATE prayer_requests 
          SET updated_at = datetime('now') 
          WHERE id = ?
        `)
        .bind(update.prayer_request_id)
        .run();
    }
  }

  // Reject suggested update
  async rejectSuggestedUpdate(updateId: number, adminId: number, adminNotes?: string): Promise<void> {
    await this.db
      .prepare(`
        UPDATE suggested_updates 
        SET status = 'rejected', 
            reviewed_by = ?, 
            reviewed_at = datetime('now'),
            admin_notes = ?
        WHERE id = ?
      `)
      .bind(adminId, adminNotes || '', updateId)
      .run();
  }

  // Get approved updates for a prayer request
  async getApprovedUpdatesForPrayer(prayerRequestId: number): Promise<SuggestedUpdate[]> {
    const results = await this.db
      .prepare(`
        SELECT su.*, u.username as suggested_by_username
        FROM suggested_updates su
        JOIN users u ON su.suggested_by = u.id
        WHERE su.prayer_request_id = ? AND su.status = 'approved'
        ORDER BY su.reviewed_at DESC
      `)
      .bind(prayerRequestId)
      .all();

    return results.results as SuggestedUpdate[];
  }

  // Delete prayer request (admin only)
  async deletePrayerRequest(id: number): Promise<void> {
    // Delete associated suggested updates first
    await this.db
      .prepare('DELETE FROM suggested_updates WHERE prayer_request_id = ?')
      .bind(id)
      .run();

    // Delete the prayer request
    await this.db
      .prepare('DELETE FROM prayer_requests WHERE id = ?')
      .bind(id)
      .run();
  }

  // Get all prayer categories
  async getAllCategories(): Promise<any[]> {
    const results = await this.db
      .prepare(`
        SELECT id, name, description, color, icon, sort_order, is_active, created_at
        FROM prayer_categories 
        WHERE is_active = 1 
        ORDER BY sort_order, name
      `)
      .all();

    return results.results as any[];
  }

  // Get prayer request counts by category
  async getPrayerCountsByCategory(): Promise<any[]> {
    const results = await this.db
      .prepare(`
        SELECT 
          pr.category,
          pc.color,
          pc.icon,
          COUNT(*) as count
        FROM prayer_requests pr
        LEFT JOIN prayer_categories pc ON pr.category = pc.name
        WHERE pr.status = 'active'
        GROUP BY pr.category, pc.color, pc.icon
        ORDER BY count DESC
      `)
      .all();

    return results.results as any[];
  }

  // Bulk import prayer requests from array
  async bulkImportPrayerRequests(prayers: PrayerRequestForm[], userId: number): Promise<{success: number, failed: number, errors: string[]}> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const prayer of prayers) {
      try {
        if (!prayer.title || !prayer.content || !prayer.requester_name) {
          failed++;
          errors.push(`Missing required fields for: ${prayer.title || 'Unknown'}`);
          continue;
        }

        await this.createPrayerRequest(prayer, userId);
        success++;
      } catch (error) {
        failed++;
        errors.push(`Failed to import "${prayer.title}": ${error}`);
      }
    }

    // Log the import
    await this.db
      .prepare(`
        INSERT INTO import_logs (imported_by, records_imported, records_failed, import_notes)
        VALUES (?, ?, ?, ?)
      `)
      .bind(userId, success, failed, JSON.stringify(errors.slice(0, 10))) // Store first 10 errors
      .run();

    return { success, failed, errors };
  }

  // Get export data for all active prayers
  async getExportData(): Promise<any[]> {
    const results = await this.db
      .prepare(`
        SELECT 
          pr.title,
          pr.content,
          pr.requester_name,
          pr.category,
          pr.status,
          pr.created_at,
          pr.updated_at,
          u.full_name as submitted_by_name,
          GROUP_CONCAT(
            CASE WHEN su.status = 'approved' 
            THEN su.suggested_content || ' (Updated: ' || su.reviewed_at || ')'
            END, ' | '
          ) as approved_updates
        FROM prayer_requests pr
        LEFT JOIN users u ON pr.submitted_by = u.id
        LEFT JOIN suggested_updates su ON pr.id = su.prayer_request_id
        WHERE pr.status = 'active'
        GROUP BY pr.id
        ORDER BY pr.created_at DESC
      `)
      .all();

    return results.results as any[];
  }

  // Get recent prayer activity for admin tracking
  async getRecentPrayerActivity(limit: number = 20): Promise<any[]> {
    const results = await this.db
      .prepare(`
        SELECT 
          pr.id,
          pr.title,
          pr.requester_name,
          pr.category,
          pr.created_at,
          pr.updated_at,
          pc.color,
          pc.icon,
          CASE 
            WHEN pr.updated_at > pr.created_at THEN 'updated'
            ELSE 'created'
          END as activity_type,
          (
            SELECT COUNT(*) 
            FROM suggested_updates su 
            WHERE su.prayer_request_id = pr.id 
            AND su.status = 'pending'
          ) as pending_updates_count,
          (
            SELECT COUNT(*) 
            FROM suggested_updates su 
            WHERE su.prayer_request_id = pr.id 
            AND su.status = 'approved'
          ) as approved_updates_count
        FROM prayer_requests pr
        LEFT JOIN prayer_categories pc ON pr.category = pc.name
        WHERE pr.status = 'active'
        ORDER BY 
          CASE 
            WHEN pr.updated_at > pr.created_at THEN pr.updated_at
            ELSE pr.created_at
          END DESC
        LIMIT ?
      `)
      .bind(limit)
      .all();

    return results.results as any[];
  }

  // Get prayers that haven't been updated in a while (stale prayers)
  async getStalePrayers(daysSinceUpdate: number = 30): Promise<any[]> {
    const results = await this.db
      .prepare(`
        SELECT 
          pr.id,
          pr.title,
          pr.requester_name,
          pr.category,
          pr.created_at,
          pr.updated_at,
          pc.color,
          pc.icon,
          ROUND(
            (julianday('now') - julianday(pr.updated_at))
          ) as days_since_update
        FROM prayer_requests pr
        LEFT JOIN prayer_categories pc ON pr.category = pc.name
        WHERE pr.status = 'active'
        AND (julianday('now') - julianday(pr.updated_at)) >= ?
        ORDER BY pr.updated_at ASC
      `)
      .bind(daysSinceUpdate)
      .all();

    return results.results as any[];
  }
}