import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getUserStack,
  getUserWatchlist,
  getUserKeyTools,
  setKeyTools,
  UserToolsResponse,
} from "@/lib/tool";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";

export function useUserStack(username: string, enabled: boolean = true) {
  return useQuery<UserToolsResponse>({
    queryKey: ["user-stack", username],
    queryFn: () => getUserStack(username),
    enabled: enabled && !!username,
  });
}

export function useUserWatchlist(username: string, enabled: boolean = true) {
  return useQuery<UserToolsResponse>({
    queryKey: ["user-watchlist", username],
    queryFn: () => getUserWatchlist(username),
    enabled: enabled && !!username,
  });
}

export function useUserKeyTools(username: string, enabled: boolean = true) {
  return useQuery<UserToolsResponse>({
    queryKey: ["user-key-tools", username],
    queryFn: () => getUserKeyTools(username),
    enabled: enabled && !!username,
  });
}

export function useSetKeyTools(username: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (toolIds: string[]): Promise<void> => {
      const supabase = createClient();
      await setKeyTools(supabase, toolIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-key-tools", username] });
      toast.success("Key tools updated");
    },
    onError: (error: Error) => {
      toast.error("Failed to update key tools");
      console.error(error);
    },
  });
}
