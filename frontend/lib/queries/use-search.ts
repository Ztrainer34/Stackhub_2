import { useQuery } from "@tanstack/react-query";
import { SearchableCategory, search, facetCounts } from "../search";
import { createClient } from "@/utils/supabase/client";

export function useSearch(query: string, category: SearchableCategory, page: number) {
  return useQuery({
    queryKey: ["search", { query, category, page }],
    queryFn: async () => {
      const supabase = createClient();
      return search(supabase, query, category, page);
    },
    enabled: !!query && !!category && page >= 1,
  });
}

export function useFacetCounts(query: string) {
  return useQuery({
    queryKey: ["facetCounts", query],
    queryFn: async () => {
      const supabase = createClient();
      return facetCounts(supabase, query);
    },
    enabled: !!query,
    staleTime: 60 * 1000 * 10, // Cache for 10 min
  });
}