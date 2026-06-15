import { fetchApi } from "./api";

export type Category = {
  id: number;
  name: string;
  slug: string;
};

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