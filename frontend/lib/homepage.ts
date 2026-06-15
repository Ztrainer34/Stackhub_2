import { fetchApi, fetchApiAuthenticated } from "./api";
import { Post } from "./post";
import { Category } from "./category";
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