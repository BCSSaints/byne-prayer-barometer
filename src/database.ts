// Database service for Prayer App
import { PrayerRequest, SuggestedUpdate, PrayerRequestForm, SuggestedUpdateForm } from './types';

export class PrayerService {
  constructor(private db: D1Database) {}

  // Get all active prayer requests
  async getAllPrayerRequests(): Promise<PrayerRequest[]> {
    const results = await this.db
      .prepare(`
        SELECT id, title, content, requester_name, submitted_by, status, 
               created_at, updated_at 
        FROM prayer_requests 
        WHERE status != 'archived'
        ORDER BY created_at DESC
      `)
      .all();

    return results.results as PrayerRequest[];
  }

  // Get prayer request by ID
  async getPrayerRequestById(id: number): Promise<PrayerRequest | null> {
    const result = await this.db
      .prepare(`
        SELECT id, title, content, requester_name, submitted_by, status, 
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
        INSERT INTO prayer_requests (title, content, requester_name, submitted_by) 
        VALUES (?, ?, ?, ?)
      `)
      .bind(data.title, data.content, data.requester_name, userId)
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
}