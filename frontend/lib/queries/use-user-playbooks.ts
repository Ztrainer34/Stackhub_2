import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listUserPosts,
  listUserPostsByStatus,
  listUserStarredPosts,
  getUserKeyPlaybooks,
  setKeyPlaybooks,
  PostType,
} from "../post";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";

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

export function useUserPostsByStatus(
  enabled: boolean,
  username: string,
  status: "waiting" | "rejected",
  page: number = 1,
  limit: number = 20
) {
  return useQuery({
    queryKey: ["approval-posts", username, status, page, limit],
    queryFn: async () => {
      const supabase = createClient();
      return listUserPostsByStatus(username, status, page, limit, supabase);
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

export function useUserKeyPlaybooks(username: string, enabled: boolean = true) {
  return useQuery({
    queryKey: ["user-key-playbooks", username],
    queryFn: () => getUserKeyPlaybooks(username),
    enabled: enabled && !!username,
  });
}

export function useSetKeyPlaybooks(username: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postIds: string[]): Promise<void> => {
      const supabase = createClient();
      await setKeyPlaybooks(supabase, postIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["user-key-playbooks", username],
      });
      toast.success("Featured playbooks updated");
    },
    onError: (error: Error) => {
      toast.error("Failed to update playbooks");
      console.error(error);
    },
  });
}
