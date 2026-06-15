import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import {
  fetchNotifications,
  fetchUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type NotificationsResponse,
} from "../notifications";

export function useNotifications(page = 1, limit = 20) {
  const supabase = createClient();
  
  return useQuery<NotificationsResponse>({
    queryKey: ["notifications", page, limit],
    queryFn: () => fetchNotifications(supabase, page, limit),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

// Lightweight hook for just the unread count (for navbar indicator)
export function useUnreadNotificationCount() {
  const supabase = createClient();
  
  return useQuery<number>({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => fetchUnreadNotificationCount(supabase),
    staleTime: 1000 * 60 * 2, // 2 minutes
    refetchInterval: 1000 * 60 * 5, // Auto-refetch every 5 minutes
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      console.log("Starting API call for markNotificationAsRead:", notificationId);
      const result = await markNotificationAsRead(supabase, notificationId);
      console.log("API call completed for markNotificationAsRead");
      return result;
    },
    onMutate: (notificationId) => {
      console.log("onMutate: Optimistically updating UI for:", notificationId);
      // Immediately update notifications list
      queryClient.setQueriesData(
        { queryKey: ["notifications"] },
        (oldData: NotificationsResponse | undefined) => {
          console.log("oldData in onMutate:", oldData);
          if (!oldData || !oldData.notifications) {
            console.log("No oldData or notifications array, skipping update");
            return oldData;
          }
          
          return {
            ...oldData,
            notifications: oldData.notifications.map((notification) =>
              notification.id === notificationId
                ? { ...notification, is_read: true }
                : notification
            ),
            unread_count: Math.max(0, oldData.unread_count - 1),
          };
        }
      );

      // Immediately update unread count
      queryClient.setQueryData(
        ["notifications", "unread-count"],
        (oldCount: number | undefined) => Math.max(0, (oldCount || 0) - 1)
      );
    },
    onError: (error) => {
      console.error("markNotificationAsRead failed:", error);
    },
    onSuccess: () => {
      console.log("markNotificationAsRead succeeded");
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();
  const supabase = createClient();

  return useMutation({
    mutationFn: async () => {
      console.log("Starting API call for markAllNotificationsAsRead");
      const result = await markAllNotificationsAsRead(supabase);
      console.log("API call completed for markAllNotificationsAsRead");
      return result;
    },
    onMutate: () => {
      console.log("onMutate: Optimistically updating all notifications as read");
      // Immediately update all notifications as read
      queryClient.setQueriesData(
        { queryKey: ["notifications"] },
        (oldData: NotificationsResponse | undefined) => {
          console.log("oldData in markAll onMutate:", oldData);
          if (!oldData || !oldData.notifications) {
            console.log("No oldData or notifications array, skipping markAll update");
            return oldData;
          }
          
          return {
            ...oldData,
            notifications: oldData.notifications.map((notification) => ({
              ...notification,
              is_read: true,
            })),
            unread_count: 0,
          };
        }
      );

      // Immediately update unread count to 0
      queryClient.setQueryData(["notifications", "unread-count"], 0);
    },
    onError: (error) => {
      console.error("markAllNotificationsAsRead failed:", error);
    },
    onSuccess: () => {
      console.log("markAllNotificationsAsRead succeeded");
    },
  });
}