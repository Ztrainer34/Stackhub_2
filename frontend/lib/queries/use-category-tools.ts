import { useQuery } from "@tanstack/react-query";
import { getToolsByCategory, PaginatedToolsResponse } from "@/lib/tool";
import { getCategoryBySlug, Category } from "@/lib/category";
import { createClient } from "@/utils/supabase/client";

export function useCategoryTools(categorySlug: string, page: number = 1, limit: number = 12) {
  return useQuery<PaginatedToolsResponse>({
    queryKey: ["category-tools", categorySlug, page, limit],
    queryFn: () => {
      const supabase = createClient();
      return getToolsByCategory(supabase, categorySlug, page, limit);
    },
    enabled: !!categorySlug,
  });
}

export function useCategory(categorySlug: string) {
  return useQuery<Category>({
    queryKey: ["category", categorySlug],
    queryFn: () => getCategoryBySlug(categorySlug),
    enabled: !!categorySlug,
  });
}