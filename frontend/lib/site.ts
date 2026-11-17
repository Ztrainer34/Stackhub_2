/**
 * The one public origin of the site. Canonicals, Open Graph URLs, the sitemap
 * and robots.txt all derive from it, so no page hardcodes a domain.
 *
 * The bare domain is primary: Vercel serves stackhub.me and 308-redirects
 * www.stackhub.me to it. If that ever flips, change it here only.
 */
export const SITE_URL = "https://stackhub.me";

export const SITE_NAME = "StackHub";

export const SITE_DESCRIPTION =
  "StackHub is where GTM people share their tool stacks and playbooks. See which tools top operators use, how they use them, and compare tools.";

/** Trim text to a meta description length, cutting on a word boundary. */
export function metaDescription(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}
