import { useQuery } from "@tanstack/react-query";
import { listTools } from "../tool";
import { getTopCategories } from "../homepage";

export function useBrowseTools(params: {
  q: string;
  category: string;
  sort: string;
  page: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: [
      "browse-tools",
      params.q,
      params.category,
      params.sort,
      params.page,
      params.limit ?? 24,
    ],
    queryFn: () => listTools(params),
    staleTime: 30_000,
  });
}

export function useToolCategories(limit: number = 6) {
  return useQuery({
    queryKey: ["tool-categories", limit],
    queryFn: () => getTopCategories(limit),
    staleTime: 5 * 60_000,
  });
}
