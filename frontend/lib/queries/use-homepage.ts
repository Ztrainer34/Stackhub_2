import { useQuery } from "@tanstack/react-query";
import { getRecommendedTopPosts, getTopCategories } from "../homepage";
import { createClient } from "@/utils/supabase/client";

export function useTopPosts(limit: number = 10) {
  return useQuery({
    queryKey: ["top-posts", limit],
    queryFn: async () => {
      const supabase = createClient();
      return getRecommendedTopPosts(limit, supabase);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

export function useTopCategories(limit: number = 10) {
  return useQuery({
    queryKey: ["top-categories", limit],
    queryFn: () => getTopCategories(limit),
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
}