"use client";

import { useQuery } from "@tanstack/react-query";
import { autocompleteCategory } from "@/lib/category";

export function useCategoryAutocomplete(query: string) {
  return useQuery({
    queryKey: ["categories-autocomplete", query],
    queryFn: () => autocompleteCategory(query),
    enabled: query.trim().length > 0, // Only fetch when there's a search query
    staleTime: 300000, // 5 minutes
  });
}
