import { useQuery } from "@tanstack/react-query";
import { getFeed } from "../feed";
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
