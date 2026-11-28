import { fetchApi } from "./api";

export type Category = {
  id: number;
  name: string;
  slug: string;
  /** Empty when the category has no parent. */
  parent_name?: string;
  parent_slug?: string;
  /** An old category: its page redirects. */
  is_retired?: boolean;
  /** Where a retired category went; empty when it has no replacement. */
  replaced_by_slug?: string;
};

/** Where the page of a retired category should send people, or null to stay. */
export function categoryRedirect(category: Category): string | null {
  if (!category.is_retired) return null;
  return category.replaced_by_slug
    ? `/category/${encodeURIComponent(category.replaced_by_slug)}`
    : "/tools";
}

export async function getCategoryBySlug(slug: string): Promise<Category> {
  const response = await fetchApi(`/category/${encodeURIComponent(slug)}`);

  if (!response.ok) throw new Error("Failed to fetch category");
  return response.json();
}

export async function autocompleteCategory(query: string): Promise<Category[]> {
  const response = await fetchApi(
    `/category/autocomplete?q=${encodeURIComponent(query)}&limit=50`
  );

  if (!response.ok) throw new Error("Failed to search categories");
  return response.json();
}