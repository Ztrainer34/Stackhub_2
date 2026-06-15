import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  starPost,
  unstarPost,
  getPost,
  deletePost,
  publishPost,
  unpublishPost,
} from "../post";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";

interface CreatePostData {
  type: "playbook" | "combo" | "comparison";
  name: string;
  tools: string[];
  suggested_tools?: Array<{
    name: string;
    description: string;
    website: string;
    categories: number[];
  }>;
  description: string;
}

interface CreatePostResponse {
  slug: string;
  id: string;
}

export function usePost(username: string, postSlug: string) {
  return useQuery({
    queryKey: ["post", username, postSlug],
    queryFn: async () => {
      const supabase = createClient();
      return getPost(username, postSlug, supabase);
    },
    enabled: !!username && !!postSlug,
  });
}

export function useStarPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => {
      const supabase = createClient();
      return starPost(supabase, postId);
    },
    onMutate: async (postId) => {
      // Cancel any outgoing refetches for all post queries
      await queryClient.cancelQueries({ queryKey: ["post"] });
      
      // Get all post queries and update them optimistically
      const queryCache = queryClient.getQueryCache();
      const postQueries = queryCache.findAll({ queryKey: ["post"] });
      
      const previousData: Array<{ queryKey: unknown[]; data: unknown }> = [];
      
      postQueries.forEach((query) => {
        const queryKey = query.queryKey;
        const previousPost = queryClient.getQueryData(queryKey);
        
        if (previousPost && typeof previousPost === 'object' && 'id' in previousPost && previousPost.id === postId) {
          previousData.push({ queryKey: [...queryKey], data: previousPost });
          
          // Optimistically update to the new value
          queryClient.setQueryData(queryKey, (old: unknown) => {
            if (old && typeof old === 'object' && 'id' in old && old.id === postId) {
              return { ...old, is_starred: true };
            }
            return old;
          });
        }
      });
      
      // Return context with the snapshotted values
      return { previousData };
    },
    onError: (_err, _postId, context) => {
      // If the mutation fails, roll back all changes
      context?.previousData.forEach(({ queryKey, data }) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSettled: () => {
      // Invalidate starred posts queries
      queryClient.invalidateQueries({ queryKey: ["starred-posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-posts"] });
    },
  });
}

export function useUnstarPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => {
      const supabase = createClient();
      return unstarPost(supabase, postId);
    },
    onMutate: async (postId) => {
      await queryClient.cancelQueries({ queryKey: ["post"] });
      
      const queryCache = queryClient.getQueryCache();
      const postQueries = queryCache.findAll({ queryKey: ["post"] });
      
      const previousData: Array<{ queryKey: unknown[]; data: unknown }> = [];
      
      postQueries.forEach((query) => {
        const queryKey = query.queryKey;
        const previousPost = queryClient.getQueryData(queryKey);
        
        if (previousPost && typeof previousPost === 'object' && 'id' in previousPost && previousPost.id === postId) {
          previousData.push({ queryKey: [...queryKey], data: previousPost });
          
          queryClient.setQueryData(queryKey, (old: unknown) => {
            if (old && typeof old === 'object' && 'id' in old && old.id === postId) {
              return { ...old, is_starred: false };
            }
            return old;
          });
        }
      });
      
      return { previousData };
    },
    onError: (_err, _postId, context) => {
      context?.previousData.forEach(({ queryKey, data }) => {
        queryClient.setQueryData(queryKey, data);
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["starred-posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-posts"] });
    },
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => {
      const supabase = createClient();
      return deletePost(supabase, postId);
    },
    onSuccess: () => {
      // Invalidate all post-related queries to refetch data
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["starred-posts"] });
      toast.success("Post deleted successfully");
    },
    onError: (error) => {
      toast.error("Failed to delete post");
      console.error(error);
    },
  });
}

export function usePublishPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => {
      const supabase = createClient();
      return publishPost(supabase, postId);
    },
    onSuccess: () => {
      // Invalidate all post-related queries to refetch data
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["starred-posts"] });
      queryClient.invalidateQueries({ queryKey: ["post"] });
      toast.success("Post published successfully");
    },
    onError: (error) => {
      toast.error("Failed to publish post");
      console.error(error);
    },
  });
}

export function useUnpublishPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (postId: string) => {
      const supabase = createClient();
      return unpublishPost(supabase, postId);
    },
    onSuccess: () => {
      // Invalidate all post-related queries to refetch data
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["starred-posts"] });
      queryClient.invalidateQueries({ queryKey: ["post"] });
      toast.success("Post unpublished successfully");
    },
    onError: (error) => {
      toast.error("Failed to unpublish post");
      console.error(error);
    },
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CreatePostData): Promise<CreatePostResponse> => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL!}/post/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(data),
          credentials: "include",
        }
      );

      if (!response.ok) {
        const errorMessage = await response.text();
        throw new Error(errorMessage || "Failed to create post");
      }

      return response.json();
    },
    onSuccess: () => {
      // Invalidate all post-related queries to refetch data
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      queryClient.invalidateQueries({ queryKey: ["top-posts"] });
      queryClient.invalidateQueries({ queryKey: ["user-posts"] });
    },
    onError: (error: Error) => {
      // Error handling is done in the component for better UX
      console.error("Failed to create post:", error);
    },
  });
}

