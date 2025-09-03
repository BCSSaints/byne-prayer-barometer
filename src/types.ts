// Type definitions for the Prayer App

export interface User {
  id: number;
  username: string;
  is_admin: boolean;
  created_at: string;
}

export interface PrayerRequest {
  id: number;
  title: string;
  content: string;
  requester_name: string;
  submitted_by: number;
  status: 'active' | 'answered' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface SuggestedUpdate {
  id: number;
  prayer_request_id: number;
  suggested_by: number;
  suggested_content: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes?: string;
  reviewed_by?: number;
  reviewed_at?: string;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: number;
  expires_at: string;
  created_at: string;
}

export interface CloudflareBindings {
  DB: D1Database;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface PrayerRequestForm {
  title: string;
  content: string;
  requester_name: string;
}

export interface SuggestedUpdateForm {
  suggested_content: string;
}