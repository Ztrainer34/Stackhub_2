import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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