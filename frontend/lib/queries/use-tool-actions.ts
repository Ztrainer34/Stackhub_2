import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addToStack,
  removeFromStack,
  addToWatchlist,
  removeFromWatchlist,
  addToOldStack,
  removeFromOldStack,
  followTool,
  unfollowTool,
  getTool,
} from "../tool";
import { createClient } from "@/utils/supabase/client";
import {
  applyAddToStack,
  applyAddToWatchlist,
  applyAddToOldStack,
  applyRemoveFromStack,
  applyRemoveFromWatchlist,
  applyRemoveFromOldStack,
} from "@/lib/tool-list-state";

export function useTool(toolId: string) {
  return useQuery({
    queryKey: ["tool", toolId],
    queryFn: async () => {
      const supabase = createClient();
      return getTool(supabase, toolId);
    },
    enabled: !!toolId,
  });
}

export function useAddToStack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (toolId: string) => {
      const supabase = createClient();
      return addToStack(supabase, toolId);
    },
    onMutate: async (toolId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["tool", toolId] });
      
      // Snapshot the previous value
      const previousTool = queryClient.getQueryData(["tool", toolId]);
      
      // Optimistically apply the same rule the Go handler applies.
      queryClient.setQueryData(["tool", toolId], (old: unknown) =>
        old && typeof old === "object" ? applyAddToStack(old) : old
      );

      // Return context with the snapshotted value
      return { previousTool };
    },
    onError: (_err, toolId, context) => {
      // If the mutation fails, roll back
      queryClient.setQueryData(["tool", toolId], context?.previousTool);
    },
    onSettled: () => {
      // Don't refetch the tool, just the lists it moved between.
      queryClient.invalidateQueries({ queryKey: ["stack"] });
      queryClient.invalidateQueries({ queryKey: ["followed-tools"] });
    },
  });
}

export function useRemoveFromStack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (toolId: string) => {
      const supabase = createClient();
      return removeFromStack(supabase, toolId);
    },
    onMutate: async (toolId) => {
      await queryClient.cancelQueries({ queryKey: ["tool", toolId] });
      const previousTool = queryClient.getQueryData(["tool", toolId]);
      
      queryClient.setQueryData(["tool", toolId], (old: unknown) =>
        old && typeof old === "object" ? applyRemoveFromStack(old) : old
      );
      
      return { previousTool };
    },
    onError: (_err, toolId, context) => {
      queryClient.setQueryData(["tool", toolId], context?.previousTool);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["stack"] });
    },
  });
}

export function useAddToWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (toolId: string) => {
      const supabase = createClient();
      return addToWatchlist(supabase, toolId);
    },
    onMutate: async (toolId) => {
      await queryClient.cancelQueries({ queryKey: ["tool", toolId] });
      const previousTool = queryClient.getQueryData(["tool", toolId]);
      
      queryClient.setQueryData(["tool", toolId], (old: unknown) =>
        old && typeof old === "object" ? applyAddToWatchlist(old) : old
      );

      return { previousTool };
    },
    onError: (_err, toolId, context) => {
      queryClient.setQueryData(["tool", toolId], context?.previousTool);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      // Auto-follow means the followed-tools list changed too.
      queryClient.invalidateQueries({ queryKey: ["followed-tools"] });
    },
  });
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (toolId: string) => {
      const supabase = createClient();
      return removeFromWatchlist(supabase, toolId);
    },
    onMutate: async (toolId) => {
      await queryClient.cancelQueries({ queryKey: ["tool", toolId] });
      const previousTool = queryClient.getQueryData(["tool", toolId]);

      queryClient.setQueryData(["tool", toolId], (old: unknown) =>
        old && typeof old === "object" ? applyRemoveFromWatchlist(old) : old
      );

      return { previousTool };
    },
    onError: (_err, toolId, context) => {
      queryClient.setQueryData(["tool", toolId], context?.previousTool);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    },
  });
}

export function useAddToOldStack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (toolId: string) => {
      const supabase = createClient();
      return addToOldStack(supabase, toolId);
    },
    onMutate: async (toolId) => {
      await queryClient.cancelQueries({ queryKey: ["tool", toolId] });
      const previousTool = queryClient.getQueryData(["tool", toolId]);

      queryClient.setQueryData(["tool", toolId], (old: unknown) =>
        old && typeof old === "object" ? applyAddToOldStack(old) : old
      );

      return { previousTool };
    },
    onError: (_err, toolId, context) => {
      queryClient.setQueryData(["tool", toolId], context?.previousTool);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["old-stack"] });
      queryClient.invalidateQueries({ queryKey: ["stack"] });
      queryClient.invalidateQueries({ queryKey: ["watchlist"] });
      queryClient.invalidateQueries({ queryKey: ["followed-tools"] });
    },
  });
}

export function useRemoveFromOldStack() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (toolId: string) => {
      const supabase = createClient();
      return removeFromOldStack(supabase, toolId);
    },
    onMutate: async (toolId) => {
      await queryClient.cancelQueries({ queryKey: ["tool", toolId] });
      const previousTool = queryClient.getQueryData(["tool", toolId]);

      queryClient.setQueryData(["tool", toolId], (old: unknown) =>
        old && typeof old === "object" ? applyRemoveFromOldStack(old) : old
      );

      return { previousTool };
    },
    onError: (_err, toolId, context) => {
      queryClient.setQueryData(["tool", toolId], context?.previousTool);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["old-stack"] });
    },
  });
}

export function useFollowTool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (toolId: string) => {
      const supabase = createClient();
      return followTool(supabase, toolId);
    },
    onMutate: async (toolId) => {
      await queryClient.cancelQueries({ queryKey: ["tool", toolId] });
      const previousTool = queryClient.getQueryData(["tool", toolId]);

      queryClient.setQueryData(["tool", toolId], (old: unknown) => {
        if (old && typeof old === "object") {
          return { ...old, is_followed: true };
        }
        return old;
      });

      return { previousTool };
    },
    onError: (_err, toolId, context) => {
      queryClient.setQueryData(["tool", toolId], context?.previousTool);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["followed-tools"] });
    },
  });
}

export function useUnfollowTool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (toolId: string) => {
      const supabase = createClient();
      return unfollowTool(supabase, toolId);
    },
    onMutate: async (toolId) => {
      await queryClient.cancelQueries({ queryKey: ["tool", toolId] });
      const previousTool = queryClient.getQueryData(["tool", toolId]);

      queryClient.setQueryData(["tool", toolId], (old: unknown) => {
        if (old && typeof old === "object") {
          return { ...old, is_followed: false };
        }
        return old;
      });

      return { previousTool };
    },
    onError: (_err, toolId, context) => {
      queryClient.setQueryData(["tool", toolId], context?.previousTool);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["followed-tools"] });
    },
  });
}