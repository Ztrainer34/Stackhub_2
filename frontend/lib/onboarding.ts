import { SupabaseClient } from "@supabase/supabase-js";
import { fetchApiAuthenticated } from "./api";

export interface OnboardingTool {
  id: string;
  name: string;
  logo_url: string | null;
}

export interface OnboardingOptions {
  focus_areas: string[];
  tools: OnboardingTool[];
}

/**
 * The curated focus areas, plus the tools to offer. Passing the user's chosen
 * focus areas mixes in tools from those categories alongside the popular ones.
 */
export async function getOnboardingOptions(
  supabaseClient: SupabaseClient,
  focusAreas: string[] = []
): Promise<OnboardingOptions> {
  const qs = focusAreas.map((f) => `focus=${encodeURIComponent(f)}`).join("&");
  const resp = await fetchApiAuthenticated(
    supabaseClient,
    `/onboarding/options${qs ? `?${qs}` : ""}`
  );
  if (!resp.ok) throw new Error("Could not load onboarding options");
  return resp.json();
}

/** Saves focus areas and adds the chosen tools to the user's stack. */
export async function saveOnboarding(
  supabaseClient: SupabaseClient,
  data: { focus_areas: string[]; tool_ids: string[] }
): Promise<void> {
  const resp = await fetchApiAuthenticated(supabaseClient, `/onboarding/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!resp.ok) throw new Error((await resp.text()) || "Could not save your choices");
}
