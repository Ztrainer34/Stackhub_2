/**
 * Where "Claim this page" sends people: "Claim your Page on StackHub", asking
 * for their name, email and LinkedIn profile, same as ColdIQ's claim flow.
 * Claims are reviewed by hand — granting ownership is a back-office action
 * (scripts/grant-tool-owner.mjs), never an API call.
 *
 * The form URL is public, so it lives here rather than in the environment and
 * the call to action works without any deploy-time configuration.
 * NEXT_PUBLIC_TOOL_CLAIM_FORM_URL still overrides it, for pointing a preview
 * deployment at a throwaway form.
 */
const CLAIM_FORM_URL =
  process.env.NEXT_PUBLIC_TOOL_CLAIM_FORM_URL ?? "https://tally.so/r/Melv4g";

export function claimFormUrl(tool: { id: string; name: string }): string | null {
  if (!CLAIM_FORM_URL) return null;

  try {
    const url = new URL(CLAIM_FORM_URL);
    // Tally prefills fields from query parameters, so a submission says which
    // page it is about without the person retyping the tool's name.
    url.searchParams.set("tool", tool.name);
    url.searchParams.set("tool_id", tool.id);
    return url.toString();
  } catch {
    return null;
  }
}
