import { useQuery } from "@tanstack/react-query";
import { getFollowList, getUserStats } from "@/lib/user";
import { createClient } from "@/utils/supabase/client";

export function useFollowList(
  username: string,
  kind: "followers" | "following",
  page: number = 1,
  limit: number = 20
) {
  return useQuery({
    queryKey: ["follow-list", username, kind, page, limit],
    queryFn: async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      // Pass the authenticated client only when logged in so the backend can
      // compute `is_following` relative to the viewer.
      return getFollowList(
        username,
        kind,
        page,
        limit,
        session ? supabase : undefined
      );
    },
    enabled: !!username,
  });
}

export function useUserStats(username: string) {
  return useQuery({
    queryKey: ["user-stats", username],
    queryFn: () => getUserStats(username),
    enabled: !!username,
  });
}
