import { fetchApi, fetchApiAuthenticated } from "./api";
import { Post } from "./post";
import { Category } from "./category";
import { Tool } from "./tool";
import { SupabaseClient } from "@supabase/supabase-js";

export interface TopCategory extends Category {
  tool_count: number;
}

export async function getRecommendedTopPosts(limit: number = 10, supabaseClient: SupabaseClient): Promise<Post[]> {
  const response = await fetchApiAuthenticated(supabaseClient, `/homepage/top-posts?limit=${limit}`)

  if (!response.ok) throw new Error("Failed to fetch top posts");
  
  return response.json();
}

export async function getTopCategories(limit: number = 10): Promise<TopCategory[]> {
  const response = await fetchApi(`/homepage/top-categories?limit=${limit}`);

  if (!response.ok) throw new Error("Failed to fetch top categories");

  return response.json();
}

/**
 * A tool on the dashboard's "Popular tools" shelf. `stack_count` is how many
 * people hold it in an active stack — the ranking signal, and worth showing,
 * since "412 people use this" says more than a position in a list.
 */
export interface PopularTool extends Tool {
  /** How many people hold this tool in an active stack. */
  stack_count: number;
  /**
   * Playbooks published in the last 7 days that mention it — the "rising this
   * week" signal. Stack membership carries no timestamp, so publishing activity
   * is the only weekly measure the schema can answer.
   */
  recent_mentions: number;
}

export async function getPopularTools(limit: number = 6): Promise<PopularTool[]> {
  const response = await fetchApi(`/homepage/popular-tools?limit=${limit}`);

  if (!response.ok) throw new Error("Failed to fetch popular tools");

  return response.json();
}