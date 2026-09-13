import { SupabaseClient } from "@supabase/supabase-js";
import { fetchApiAuthenticated } from "./api";

export type User = {
  id: string;
  username: string;
  email_hash?: string;
  /** Uploaded picture. When absent the UI falls back to Gravatar. */
  avatar_url?: string | null;
  display_name?: string;
  bio?: string;
  website?: string;
  company?: string;
  location?: string;
  linkedin?: string;
  twitter?: string;
  created_at?: string;
  updated_at?: string;
  /**
   * Whether the signed-in viewer follows this profile. Only present when the
   * request carried a session — anonymous reads leave it undefined.
   */
  is_following?: boolean;
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

/**
 * Pass the caller's Supabase client to get is_following back with the profile;
 * without it the request is anonymous and the field is omitted.
 */
export async function getUserFromUsername(
  username: string,
  supabaseClient?: SupabaseClient
): Promise<User> {
  const path = `/user/${username}`;

  const resp = supabaseClient
    ? await fetchApiAuthenticated(supabaseClient, path)
    : await fetch(`${process.env.NEXT_PUBLIC_API_URL!}${path}`);

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
  avatar_url?: string | null;
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

/** Uploads a new profile picture and returns its public URL. */
export async function uploadAvatar(
  supabaseClient: SupabaseClient,
  file: File
): Promise<{ avatar_url: string }> {
  const body = new FormData();
  body.append("image", file);

  const resp = await fetchApiAuthenticated(supabaseClient, `/user/avatar`, {
    method: "POST",
    body,
  });

  if (!resp.ok) throw new Error((await resp.text()) || "Could not upload the picture");
  return resp.json();
}

/** Removes the uploaded picture, falling back to Gravatar. */
export async function removeAvatar(supabaseClient: SupabaseClient): Promise<void> {
  const resp = await fetchApiAuthenticated(supabaseClient, `/user/avatar`, {
    method: "DELETE",
  });

  if (!resp.ok) throw new Error((await resp.text()) || "Could not remove the picture");
}
