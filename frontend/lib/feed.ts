import { SupabaseClient } from "@supabase/supabase-js";
import { fetchApiAuthenticated } from "./api";

/** What produced the event — used to explain "why am I seeing this?". */
export type FeedReason = "following_user" | "following_tool" | "latest";

export type FeedKind = "post" | "tool_follow" | "user_follow";

export interface FeedItem {
  kind: FeedKind;
  reason: FeedReason;
  occurred_at: string;
  actor_id: string;
  actor_username: string;
  post_id: string | null;
  post_name: string | null;
  post_slug: string | null;
  post_type: string | null;
  post_description: string | null;
  tool_id: string | null;
  tool_name: string | null;
  tool_logo_url: string | null;
  target_user_id: string | null;
  target_username: string | null;
}

export interface FeedResponse {
  items: FeedItem[];
  page: number;
  limit: number;
  total_count: number;
}

export async function getFeed(
  supabaseClient: SupabaseClient,
  params: { page?: number; limit?: number } = {}
): Promise<FeedResponse> {
  const search = new URLSearchParams();
  search.set("page", String(params.page ?? 1));
  search.set("limit", String(params.limit ?? 20));

  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/feed?${search.toString()}`
  );

  if (!response.ok) throw new Error("Failed to fetch feed");
  return response.json();
}
