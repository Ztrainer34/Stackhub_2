import { useQuery } from "@tanstack/react-query";
import {
  getUserStack,
  getUserWatchlist,
  UserToolsResponse,
} from "@/lib/tool";

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
