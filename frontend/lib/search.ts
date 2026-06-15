import { SupabaseClient } from '@supabase/supabase-js';
import { Post } from "./post";
import { Tool } from "./tool";
import { User } from "./user";
import { fetchApiAuthenticated } from "./api";

export const searchableCategoryValues = ["post", "tool", "profile"] as const;
export type SearchableCategory = (typeof searchableCategoryValues)[number];

export type FacetCounts = {
  post_count: number;
  tool_count: number;
  profile_count: number;
};

type SearchResultTaggedData =
  | { type: "post"; data: Post[] }
  | { type: "tool"; data: Tool[] }
  | { type: "profile"; data: User[] };

// For later use
type SearchResultMetadata = {
  total_pages: number;
  current_page: number;
  total_count: number;
};

export type SearchResult = SearchResultTaggedData & SearchResultMetadata;

export async function facetCounts(
  supabaseClient: SupabaseClient,
  query: string,
): Promise<FacetCounts> {
  const resp = await fetchApiAuthenticated(
    supabaseClient, 
    "/search/facets?" + new URLSearchParams({ q: query })
  );

  if (!resp.ok) throw new Error("Failed get facet counts");
  return (await resp.json()) as FacetCounts;
}

export async function search(
  supabaseClient: SupabaseClient,
  query: string,
  category: SearchableCategory,
  page: number
): Promise<SearchResult> {
  const resp = await fetchApiAuthenticated(
    supabaseClient,
    "/search?" + new URLSearchParams({ q: query, t: category, p: String(page) })
  );

  if (!resp.ok) throw new Error("Failed to search");
  return (await resp.json()) as SearchResult;
}
