// Type definitions for the Prayer App

export interface User {
  id: number;
  username: string;
  email?: string;
  full_name?: string;
  role: 'super_admin' | 'admin' | 'moderator' | 'member';
  status: 'active' | 'inactive' | 'suspended';
  is_admin: boolean; // Keep for backward compatibility
  created_by?: number;
  last_login?: string;
  created_at: string;
}

export interface Permission {
  id: number;
  name: string;
  description: string;
  created_at: string;
}

export interface CreateUserForm {
  username: string;
  password: string;
  email: string;
  full_name: string;
  role: 'admin' | 'moderator' | 'member';
}

export interface PrayerRequest {
  id: number;
  title: string;
  content: string;
  requester_name: string;
  requester_email?: string; // Optional email for prayer requests
  submitted_by?: number; // Optional - null for guest submissions
  category: string;
  status: 'active' | 'answered' | 'archived';
  is_private: boolean; // If true, only visible to logged-in users
  created_at: string;
  updated_at: string;
}

export interface PrayerCategory {
  id: number;
  name: string;
  description: string;
  color: string;
  icon: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
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
  requester_email?: string; // Optional email for contact
  category: string;
  is_private?: boolean; // Optional - defaults to false (public)
}

export interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export interface SuggestedUpdateForm {
  suggested_content: string;
}