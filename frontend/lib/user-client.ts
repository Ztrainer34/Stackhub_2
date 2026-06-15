import { SupabaseClient } from '@supabase/supabase-js';
import { fetchApiAuthenticated } from './api';

export type User = {
  id: string;
  username: string;
}

export async function followUser(supabaseClient: SupabaseClient, userId: string): Promise<void> {
  const response = await fetchApiAuthenticated(supabaseClient, `/user/follow/${userId}`, {
    method: "PUT",
  });

  if (!response.ok) throw new Error("Failed to follow user");
}

export async function unfollowUser(supabaseClient: SupabaseClient, userId: string): Promise<void> {
  const response = await fetchApiAuthenticated(supabaseClient, `/user/follow/${userId}`, {
    method: "DELETE",
  });

  if (!response.ok) throw new Error("Failed to unfollow user");
}

export async function getTopRecommendedUsers(username: string, supabaseClient: SupabaseClient): Promise<User[]> {
  const resp = await fetchApiAuthenticated(supabaseClient, "/top-recommended-users");

  if (!resp.ok) throw new Error("Could not get top recommended users");

  return (await resp.json()) as User[]
}