import { SupabaseClient } from "@supabase/supabase-js";
import { fetchApiAuthenticated } from "./api";

export type User = {
  id: string;
  username: string;
  email_hash?: string;
  display_name?: string;
  bio?: string;
  website?: string;
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
