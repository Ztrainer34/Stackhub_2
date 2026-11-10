import { SupabaseClient } from "@supabase/supabase-js";
import { fetchApiAuthenticated } from "./api";

/**
 * What produced the event — used to explain "why am I seeing this?". For
 * notification rows this is the notification's own type instead.
 */
export type FeedReason =
  | "following_user"
  | "stack_tool"
  | "watchlist_tool"
  | "latest"
  | "post_star"
  | "post_comment"
  | "follow"
  | "tool_approved";

export type FeedKind = "notification" | "post";

export interface FeedItem {
  kind: FeedKind;
  /** Stable per-row id ("post:<uuid>" or "notification:<uuid>"); unique within a response. */
  event_key: string;
  reason: FeedReason;
  /**
   * How closely the event concerns the viewer: 0 things about you, 1 people you
   * follow, 2 tools in your stack, 3 other followed tools (watchlist and manual
   * follows), 4 discovery filler.
   *
   * Tier is the *second* sort key, not the first. The server bands events by
   * age — the last 3 days above everything older — and sorts by tier within
   * each band. So a fresh tier 3 outranks a stale tier 1, while among today's
   * events a stack tool still outranks a watchlisted one.
   *
   * The list therefore is NOT globally ordered by tier: the same tier appears
   * twice, once in each band. Do not group rows by tier assuming they are
   * contiguous.
   */
  tier: number;
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
  /** Ready-made sentence for notification rows; null for everything else. */
  notification_message: string | null;
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

/** True when the server holds more feed items than this response carries. */
export function hasMoreFeed(resp: FeedResponse): boolean {
  return resp.total_count > resp.items.length;
}

/** Next page number for an infinite feed, or undefined when there is none. */
export function nextFeedPage(last: FeedResponse): number | undefined {
  if (last.items.length === 0) return undefined;
  return last.page * last.limit < last.total_count ? last.page + 1 : undefined;
}

/**
 * Concatenates pages in order, dropping any item whose event_key was already
 * seen. Offset paging can repeat a row when new events arrive or one ages
 * out of the 3-day band between page loads; the first occurrence wins.
 */
export function flattenFeedPages(pages: FeedResponse[]): FeedItem[] {
  const seen = new Set<string>();
  const out: FeedItem[] = [];
  for (const page of pages) {
    for (const item of page.items) {
      if (seen.has(item.event_key)) continue;
      seen.add(item.event_key);
      out.push(item);
    }
  }
  return out;
}
