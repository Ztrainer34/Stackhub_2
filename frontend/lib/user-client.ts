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

export async function getTopRecommendedUsers(
  username: string,
  supabaseClient: SupabaseClient,
  offset = 0
): Promise<User[]> {
  const endpoint =
    offset > 0 ? `/top-recommended-users?offset=${offset}` : "/top-recommended-users";
  const resp = await fetchApiAuthenticated(supabaseClient, endpoint);

  if (!resp.ok) throw new Error("Could not get top recommended users");

  return (await resp.json()) as User[]
}