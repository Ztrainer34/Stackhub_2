import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getFeed, nextFeedPage } from "../feed";
import { createClient } from "@/utils/supabase/client";

export function useFeed(limit = 20) {
  return useQuery({
    queryKey: ["feed", limit],
    queryFn: async () => {
      const supabase = createClient();
      return getFeed(supabase, { limit });
    },
    staleTime: 60_000,
  });
}

export const FEED_PAGE_SIZE = 20;

export function useInfiniteFeed(pageSize = FEED_PAGE_SIZE) {
  return useInfiniteQuery({
    // Must not equal useFeed's ["feed", n]: a key shared between useQuery and
    // useInfiniteQuery corrupts the cache. Still under the ["feed"] prefix.
    queryKey: ["feed", "infinite", pageSize],
    queryFn: async ({ pageParam }) => {
      const supabase = createClient();
      return getFeed(supabase, { page: pageParam, limit: pageSize });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => nextFeedPage(lastPage),
    staleTime: 60_000,
  });
}
