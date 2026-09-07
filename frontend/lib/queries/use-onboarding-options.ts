import { useQuery } from "@tanstack/react-query";
import { getOnboardingOptions } from "../onboarding";
import { createClient } from "@/utils/supabase/client";

export function useOnboardingOptions(enabled: boolean, focusAreas: string[] = []) {
  // Sorted so the same selection always hits the same cache entry.
  const key = [...focusAreas].sort();
  return useQuery({
    queryKey: ["onboarding-options", key],
    queryFn: () => getOnboardingOptions(createClient(), key),
    enabled,
    staleTime: Infinity, // curated lists do not change during a session
  });
}
