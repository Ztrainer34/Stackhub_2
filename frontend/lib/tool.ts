import { SupabaseClient } from "@supabase/supabase-js";
import { Vendor } from "./vendor";
import { fetchApi, fetchApiAuthenticated } from "./api";

export type Category = {
  id: number;
  name: string;
};

export type Tool = {
  id: string;
  name: string;
  description: string | null;
  logo_url: string;
  created_at: string;
  updated_at: string;
  categories: Category[];
  vendor: Vendor;
  is_published: boolean;
  is_in_stack: boolean;
  is_in_watchlist: boolean;
  is_followed?: boolean;
  added_at?: string;
};

export type PaginatedToolsResponse = {
  data: Tool[];
  page: number;
  limit: number;
  total_count: number;
  total_pages: number;
};

/**
 * URL slug for a tool: the name lowercased, with every run of non-alphanumeric
 * characters collapsed to "-" (e.g. "Brevo Marketing Platform" ->
 * "brevo-marketing-platform").
 *
 * Must stay in sync with the GetToolIDBySlug query in the backend.
 */
export function toolSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Canonical path to a tool's page. */
export function toolHref(tool: { name: string; id: string }): string {
  const slug = toolSlug(tool.name);
  return `/tool/${slug || tool.id}`;
}

export interface SuggestToolData {
  name: string;
  description?: string;
  website?: string;
  categories: number[];
}

export async function suggestTool(
  supabaseClient: SupabaseClient,
  data: SuggestToolData
): Promise<void> {
  const response = await fetchApiAuthenticated(supabaseClient, `/tool/suggest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const msg = await response.text();
    throw new Error(msg || "Failed to submit tool");
  }
}

export async function getTool(
  supabaseClient: SupabaseClient,
  id: string
): Promise<Tool> {

  const response = await fetchApiAuthenticated(supabaseClient, `/tool/${id}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch tool: ${response.status}`);
  }

  return response.json();
}

export async function autocompleteTool(
  supabaseClient: SupabaseClient,
  query: string
) {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/tool/autocomplete?q=${encodeURIComponent(query)}&limit=5`
  );

  if (!response.ok) throw new Error("Failed to fetch tools");
  return response.json();
}

export async function getToolsByCategory(
  supabaseClient: SupabaseClient,
  categorySlug: string,
  page: number = 1,
  limit: number = 12
): Promise<PaginatedToolsResponse> {
  const params = new URLSearchParams({
    page: page.toString(),
    limit: limit.toString(),
  });

  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/tools/category/${encodeURIComponent(categorySlug)}?${params}`
  );

  if (!response.ok) throw new Error("Failed to fetch tools by category");
  return response.json();
}

export async function addToStack(
  supabaseClient: SupabaseClient,
  toolId: string
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/user/stack/${toolId}`,
    { method: "PUT" }
  );

  if (!response.ok) throw new Error("Failed to add to stack");
}

export async function removeFromStack(
  supabaseClient: SupabaseClient,
  toolId: string
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/user/stack/${toolId}`,
    { method: "DELETE" }
  );

  if (!response.ok) throw new Error("Failed to remove from stack");
}

export async function addToWatchlist(
  supabaseClient: SupabaseClient,
  toolId: string
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/user/watchlist/${toolId}`,
    { method: "PUT" }
  );

  if (!response.ok) throw new Error("Failed to add to watchlist");
}

export async function removeFromWatchlist(
  supabaseClient: SupabaseClient,
  toolId: string
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/user/watchlist/${toolId}`,
    { method: "DELETE" }
  );

  if (!response.ok) throw new Error("Failed to remove from watchlist");
}

export async function followTool(
  supabaseClient: SupabaseClient,
  toolId: string
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/user/followed-tools/${toolId}`,
    { method: "PUT" }
  );

  if (!response.ok) throw new Error("Failed to follow tool");
}

export async function unfollowTool(
  supabaseClient: SupabaseClient,
  toolId: string
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/user/followed-tools/${toolId}`,
    { method: "DELETE" }
  );

  if (!response.ok) throw new Error("Failed to unfollow tool");
}

export type UserToolsResponse = {
  tools: Tool[];
};

export async function getUserFollowedTools(
  username: string
): Promise<UserToolsResponse> {
  const response = await fetchApi(
    `/user/${encodeURIComponent(username)}/followed-tools`
  );

  if (!response.ok) throw new Error("Failed to fetch followed tools");
  return response.json();
}

export async function getUserStack(username: string): Promise<UserToolsResponse> {
  const response = await fetchApi(
    `/user/${encodeURIComponent(username)}/stack`
  );

  if (!response.ok) throw new Error("Failed to fetch stack");
  return response.json();
}

export async function getUserWatchlist(
  username: string
): Promise<UserToolsResponse> {
  const response = await fetchApi(
    `/user/${encodeURIComponent(username)}/watchlist`
  );

  if (!response.ok) throw new Error("Failed to fetch watchlist");
  return response.json();
}

export async function getUserKeyTools(
  username: string
): Promise<UserToolsResponse> {
  const response = await fetchApi(
    `/user/${encodeURIComponent(username)}/key-tools`
  );

  if (!response.ok) throw new Error("Failed to fetch key tools");
  return response.json();
}

export async function setKeyTools(
  supabaseClient: SupabaseClient,
  toolIds: string[]
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/user/key-tools`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool_ids: toolIds }),
    }
  );

  if (!response.ok) throw new Error("Failed to update key tools");
}
