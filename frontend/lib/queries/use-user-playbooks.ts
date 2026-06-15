import { useQuery } from "@tanstack/react-query";
import { listUserPosts, listUserStarredPosts, PostType } from "../post";
import { createClient } from "@/utils/supabase/client";

export function useUserPosts(
  enabled: boolean,
  username: string,
  page: number = 1,
  limit: number = 20,
  postType: PostType | "" = "",
) {
  return useQuery({
    queryKey: ["posts", username, page, limit, postType],
    queryFn: async () => {
      const supabase = createClient();
      return listUserPosts(username, page, limit, postType, supabase);
    },
    enabled,
  });
}

export function useUserStarredPosts(
  enabled: boolean,
  username: string,
  page: number = 1,
  limit: number = 20
) {
  return useQuery({
    queryKey: ["starred-posts", page, limit],
    queryFn: async () => {
      const supabase = createClient();
      return listUserStarredPosts(username, page, limit, supabase);
    },
    enabled,
  });
}
