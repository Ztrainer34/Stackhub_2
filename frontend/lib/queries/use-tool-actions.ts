import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addToStack,
  removeFromStack,
  addToWatchlist,
  removeFromWatchlist,
  followTool,
  unfollowTool,
  getTool,
} from "../tool";
import { createClient } from "@/utils/supabase/client";

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
      
      // Optimistically update to the new value
      // A tool can't be in both lists: adding to the stack clears the
      // watchlist flag.
      queryClient.setQueryData(["tool", toolId], (old: unknown) => {
        if (old && typeof old === 'object') {
          return { ...old, is_in_stack: true, is_in_watchlist: false };
        }
        return old;
      });

      // Return context with the snapshotted value
      return { previousTool };
    },
    onError: (_err, toolId, context) => {
      // If the mutation fails, roll back
      queryClient.setQueryData(["tool", toolId], context?.previousTool);
    },
    onSettled: () => {
      // Don't refetch the tool, just invalidate stack
      queryClient.invalidateQueries({ queryKey: ["stack"] });
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
      
      queryClient.setQueryData(["tool", toolId], (old: unknown) => {
        if (old && typeof old === 'object') {
          return { ...old, is_in_stack: false };
        }
        return old;
      });
      
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
      
      // A tool can't be in both lists: adding to the watchlist clears the
      // stack flag.
      queryClient.setQueryData(["tool", toolId], (old: unknown) => {
        if (old && typeof old === 'object') {
          return { ...old, is_in_watchlist: true, is_in_stack: false };
        }
        return old;
      });

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

      queryClient.setQueryData(["tool", toolId], (old: unknown) => {
        if (old && typeof old === 'object') {
          return { ...old, is_in_watchlist: false };
        }
        return old;
      });

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