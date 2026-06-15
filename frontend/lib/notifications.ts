import { fetchApiAuthenticated } from "./api";
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Notification {
  id: string;
  actor_id: string;
  type: string;
  entity_id: string;
  entity_type: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  actor_username: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  page: number;
  limit: number;
  unread_count: number;
}

export async function fetchNotifications(
  supabaseClient: SupabaseClient,
  page = 1,
  limit = 20
): Promise<NotificationsResponse> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/notifications?page=${page}&limit=${limit}`
  );

  if (!response.ok) {
    throw new Error("Failed to fetch notifications");
  }

  return response.json();
}

export async function markNotificationAsRead(
  supabaseClient: SupabaseClient,
  notificationId: string
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/notifications/${notificationId}/read`,
    {
      method: "PUT",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to mark notification as read");
  }
}

export async function markAllNotificationsAsRead(
  supabaseClient: SupabaseClient
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    "/notifications/read-all",
    {
      method: "PUT",
    }
  );

  if (!response.ok) {
    throw new Error("Failed to mark all notifications as read");
  }
}

export async function fetchUnreadNotificationCount(
  supabaseClient: SupabaseClient
): Promise<number> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    "/notifications/unread-count"
  );

  if (!response.ok) {
    throw new Error("Failed to fetch unread notification count");
  }

  const data = await response.json();
  return data.count;
}