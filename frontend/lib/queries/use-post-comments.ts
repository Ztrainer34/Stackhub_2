import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listPostComments,
  createPostComment,
  removePostComment,
  updatePostComment,
} from "../post";
import { createClient } from "@/utils/supabase/client";

export function usePostComments(postId: string) {
  return useQuery({
    queryKey: ["postComments", postId],
    queryFn: () => listPostComments(postId),
    enabled: !!postId,
  });
}

export function useCreatePostComment(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) =>  {
      const supabase = createClient();
      return createPostComment(postId, content, supabase);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["postComments", postId] });
    },
  });
}

export function useRemovePostComment(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (commentId: string) => {
      const supabase = createClient();
      return removePostComment(commentId, supabase);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["postComments", postId] });
    },
  });
}

export function useUpdatePostComment(postId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) => {
      const supabase = createClient();
      return updatePostComment(commentId, content, supabase)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["postComments", postId] });
    },
  });
}