import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { fetchApiAuthenticated } from "@/lib/api";
import type { AuthState } from "@/lib/queries/use-auth";

// Use React cache to deduplicate auth state fetches during a single request
// This ensures that calling getServerAuthState() multiple times in different
// components (layout, page, etc.) only results in one backend call
export const getServerAuthState = cache(async (): Promise<AuthState> => {
  const supabase = await createClient();
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
      console.error(`Backend error during server auth check: ${response.status}`);
      // On server errors, assume they need onboarding rather than failing
      return { status: 'needs-onboarding', session };
    }

    const user = await response.json();
    return { status: 'authenticated', user, session };
  } catch (error) {
    console.error("Error fetching server auth state:", error);
    // On network errors, assume they need onboarding rather than failing
    return { status: 'needs-onboarding', session };
  }
});