import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { followUser, unfollowUser, getTopRecommendedUsers } from "../user-client";
import { createClient } from "@/utils/supabase/client";

export function useFollowUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => {
      const supabase = createClient();
      return followUser(supabase, userId);
    },
    onSuccess: () => {
      // Invalidate recommended users to refresh the list
      queryClient.invalidateQueries({ queryKey: ["top-recommended-users"] });
    },
  });
}

export function useUnfollowUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => {
      const supabase = createClient();
      return unfollowUser(supabase, userId);
    },
    onSuccess: () => {
      // Invalidate recommended users to refresh the list
      queryClient.invalidateQueries({ queryKey: ["top-recommended-users"] });
    },
  });
}

export function useTopRecommendedUsers() {
  return useQuery({
    queryKey: ["top-recommended-users"],
    queryFn: async () => {
      const supabase = createClient();
      return getTopRecommendedUsers("", supabase);
    },
  });
}

export const RECOMMENDED_USERS_PAGE_SIZE = 12;

/**
 * The /community "People you may be interested in" grid, 12 at a time.
 * Seeded with the server-rendered first page.
 *
 * Its own key, not ["top-recommended-users"]: following someone invalidates
 * that one, and refetching here would pull the card out from under the click.
 * `followedCount()` is how many shown users the viewer followed since the page
 * loaded: the backend leaves followed users out, so the next page starts that
 * many rows earlier. gcTime 0 drops the list on leaving the page, so coming
 * back starts fresh rather than with offsets that no longer line up.
 */
export function useCommunityRecommendedUsers<T extends { id: string }>(
  initialUsers: T[],
  followedCount: () => number
) {
  return useInfiniteQuery({
    queryKey: ["community-recommended-users"],
    queryFn: async ({ pageParam }) => {
      const supabase = createClient();
      return (await getTopRecommendedUsers("", supabase, pageParam)) as unknown as T[];
    },
    initialPageParam: 0,
    initialData: { pages: [initialUsers], pageParams: [0] },
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < RECOMMENDED_USERS_PAGE_SIZE
        ? undefined
        : allPages.reduce((n, page) => n + page.length, 0) - followedCount(),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
