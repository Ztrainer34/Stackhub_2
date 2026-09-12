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
  /**
   * Owner-written page copy as Tiptap JSON. `description` stays the plain-text
   * projection of it, so anything that only needs text (cards, search) keeps
   * reading that field.
   */
  description_rich?: string | null;
  logo_url: string;
  created_at: string;
  updated_at: string;
  categories: Category[];
  vendor: Vendor;
  is_published: boolean;
  is_in_stack: boolean;
  is_in_watchlist: boolean;
  is_in_old_stack?: boolean;
  is_followed?: boolean;
  /** The signed-in user owns this tool's page and may edit it. */
  is_owner?: boolean;
  /** Somebody already owns the page, so the claim call to action is hidden. */
  is_claimed?: boolean;
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

export interface BrowseTool {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
  categories: Category[];
  vendor: { website?: string | null } | null;
}

export interface BrowseToolsResponse {
  tools: BrowseTool[];
  page: number;
  limit: number;
  total_count: number;
  total_pages: number;
}

export async function listTools(params: {
  q?: string;
  category?: string;
  sort?: string;
  page?: number;
  limit?: number;
}): Promise<BrowseToolsResponse> {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.category && params.category !== "all")
    search.set("category", params.category);
  if (params.sort) search.set("sort", params.sort);
  search.set("page", String(params.page ?? 1));
  search.set("limit", String(params.limit ?? 24));

  const resp = await fetchApi(`/tools?${search.toString()}`);

  if (!resp.ok) throw new Error("Failed to list tools");

  return (await resp.json()) as BrowseToolsResponse;
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

export async function addToOldStack(
  supabaseClient: SupabaseClient,
  toolId: string
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/user/old-stack/${toolId}`,
    { method: "PUT" }
  );

  if (!response.ok) throw new Error("Failed to add to old stack");
}

export async function removeFromOldStack(
  supabaseClient: SupabaseClient,
  toolId: string
): Promise<void> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/user/old-stack/${toolId}`,
    { method: "DELETE" }
  );

  if (!response.ok) throw new Error("Failed to remove from old stack");
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

export async function getUserOldStack(
  username: string
): Promise<UserToolsResponse> {
  const response = await fetchApi(
    `/user/${encodeURIComponent(username)}/old-stack`
  );

  if (!response.ok) throw new Error("Failed to fetch old stack");
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

/** The vendor card is saved as one form; blanks clear the stored value. */
export type ToolVendorInput = {
  website: string;
  x_profile: string;
  linkedin_profile: string;
  head_office: string;
  year_of_foundation: number | null;
};

/**
 * A tool page edit. Every section is optional — each edit icon sends only the
 * part it changed, and the server leaves the rest alone.
 */
export type ToolPageUpdate = {
  description_rich?: string;
  logo_url?: string;
  vendor?: ToolVendorInput;
  category_ids?: number[];
};

/** Owner-only. Returns the tool as it now stands, ready for the query cache. */
export async function updateToolPage(
  supabaseClient: SupabaseClient,
  toolId: string,
  update: ToolPageUpdate
): Promise<Tool> {
  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/tool/${toolId}/page`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update),
    }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to save the page");
  }

  return response.json();
}

/** Owner-only. Uploads a logo file and returns its public URL. */
export async function uploadToolLogo(
  supabaseClient: SupabaseClient,
  toolId: string,
  file: File
): Promise<{ logo_url: string }> {
  const body = new FormData();
  body.append("image", file);

  const response = await fetchApiAuthenticated(
    supabaseClient,
    `/tool/${toolId}/logo`,
    { method: "POST", body }
  );

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "Failed to upload the logo");
  }

  return response.json();
}
