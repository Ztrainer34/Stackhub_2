"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";

interface UpdateProfileData {
  username?: string;
  bio?: string;
  website?: string;
  company?: string;
  location?: string;
  linkedin?: string;
  twitter?: string;
}

interface Profile {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  website?: string;
  company?: string;
  location?: string;
  linkedin?: string;
  twitter?: string;
  created_at: string;
  updated_at: string;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: UpdateProfileData): Promise<Profile> => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL!}/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!response.ok) {
        const errorMessage = await response.text();
        throw new Error(errorMessage || "Failed to update profile");
      }

      return response.json();
    },
    onSuccess: (updatedProfile) => {
      // Invalidate auth query to refresh user data everywhere
      queryClient.invalidateQueries({ queryKey: ["auth"] });

      // Also invalidate any user-specific queries
      queryClient.invalidateQueries({ queryKey: ["user", updatedProfile.username] });

      toast.success("Profile updated successfully");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Failed to update profile");
      console.error(error);
    },
  });
}
