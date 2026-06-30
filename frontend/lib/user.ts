import { SupabaseClient } from "@supabase/supabase-js";
import { fetchApiAuthenticated } from "./api";

export type User = {
  id: string;
  username: string;
  email_hash?: string;
  display_name?: string;
  bio?: string;
  website?: string;
  company?: string;
  location?: string;
  linkedin?: string;
  twitter?: string;
  created_at?: string;
  updated_at?: string;
};

export async function getAuthenticatedUser(supabaseClient: SupabaseClient): Promise<User> {
  const resp = await fetchApiAuthenticated(supabaseClient, `${process.env.NEXT_PUBLIC_API_URL!}/me`);

  if (resp.status === 428) {
    // Precondition Required - User needs onboarding
    throw new Error("ONBOARDING_REQUIRED");
  }

  if (!resp.ok) throw new Error("Could not get authenticated user");

  return (await resp.json()) as User;
}

export async function getUserFromUsername(username: string): Promise<User> {
  const resp = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL!}/user/${username}`
  );

  if (!resp.ok) throw new Error("Could not get user");

  return (await resp.json()) as User;
}

export type UserStats = {
  post_count: number;
  follower_count: number;
  following_count: number;
  // Optional: tool-following isn't implemented yet, so the backend may not
  // return this. Defaults to 0 on the frontend.
  tools_followed_count?: number;
};

export async function getUserStats(username: string): Promise<UserStats> {
  const resp = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL!}/user/${encodeURIComponent(
      username
    )}/stats`
  );

  if (!resp.ok) throw new Error("Could not get user stats");

  return (await resp.json()) as UserStats;
}

export type FollowListUser = {
  id: string;
  username: string;
  display_name?: string;
  bio?: string;
  email_hash?: string;
  is_following: boolean;
};

export type FollowListResponse = {
  users: FollowListUser[];
  total_count: number;
  total_pages: number;
};

export async function getFollowList(
  username: string,
  kind: "followers" | "following",
  page: number = 1,
  limit: number = 20,
  supabaseClient?: SupabaseClient
): Promise<FollowListResponse> {
  const path = `/user/${encodeURIComponent(
    username
  )}/${kind}?page=${page}&limit=${limit}`;

  const resp = supabaseClient
    ? await fetchApiAuthenticated(supabaseClient, path)
    : await fetch(`${process.env.NEXT_PUBLIC_API_URL!}${path}`);

  if (!resp.ok) throw new Error(`Could not get ${kind}`);

  return (await resp.json()) as FollowListResponse;
}


export async function getTopRecommendedUsers(
  username: string,
  supabaseClient: SupabaseClient
): Promise<User[]> {
  const resp = await fetchApiAuthenticated(
    supabaseClient,
    "/top-recommended-users"
  );

  if (!resp.ok) throw new Error("Could not get top recommended users");

  return (await resp.json()) as User[];
}

export async function followUser(
  supabaseClient: SupabaseClient,
  userId: string
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/user/follow/${userId}`,
    {
      method: "PUT",
    }
  );

  if (!response.ok) throw new Error("Failed to follow user");
}

export async function unfollowUser(
  supabaseClient: SupabaseClient,
  userId: string
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/user/follow/${userId}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) throw new Error("Failed to unfollow user");
}
