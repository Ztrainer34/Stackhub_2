"use client";

import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { createClient } from "@/utils/supabase/client";
import { fetchApiAuthenticated } from "@/lib/api";
import type { Session } from "@supabase/supabase-js";
import type { User } from "@/lib/user";

export type { User };

export type AuthState = 
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'needs-onboarding'; session: Session }
  | { status: 'authenticated'; user: User; session: Session };

async function fetchAuthState(): Promise<AuthState> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    return { status: 'unauthenticated' };
  }

  try {
    // Let the backend validate the JWT and determine user state
    const response = await fetchApiAuthenticated(supabase, "/me");

    if (response.status === 401) {
      // Backend says token is invalid
      return { status: 'unauthenticated' };
    }

    if (response.status === 428) {
      // Backend says user needs onboarding
      return { status: 'needs-onboarding', session };
    }

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }

    const user = await response.json();
    return { status: 'authenticated', user, session };
  } catch (error) {
    // Network errors or other issues
    console.error('Auth state fetch error:', error);
    throw error;
  }
}

export function useAuth() {
  return useQuery({
    queryKey: ['auth'],
    queryFn: fetchAuthState,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });
}

export interface OnboardingData {
  username: string;
}

export function useOnboarding() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const supabase = createClient();

  const onboard = useMutation({
    mutationFn: async (data: OnboardingData) => {
      if (auth.data?.status !== 'needs-onboarding') {
        throw new Error('Invalid authentication state for onboarding');
      }

      // Backend will validate the JWT token
      const response = await fetchApiAuthenticated(supabase, "/profile/onboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (response.status === 401) {
        throw new Error('Authentication expired. Please sign in again.');
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(error || "Failed to complete onboarding");
      }

      return response.json();
    },
    onSuccess: async () => {
      // Refresh the session to get updated JWT claims
      await supabase.auth.refreshSession();
      // Invalidate auth query to refetch user state
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });

  return {
    needsOnboarding: auth.data?.status === 'needs-onboarding',
    isLoading: auth.isLoading,
    onboard: onboard.mutate,
    isOnboarding: onboard.isPending,
    error: auth.error || onboard.error,
    user: auth.data?.status === 'authenticated' ? auth.data.user : null,
    isAuthenticated: auth.data?.status === 'authenticated',
  };
}

