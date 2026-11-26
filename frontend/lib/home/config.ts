// Homepage (logged-out): settings in one place.

/**
 * Tools shown as chips under the search bar, by slug, in this order. Each chip
 * links to the tool page. A slug that is missing or hidden is left out.
 */
export const CHIP_TOOL_SLUGS = [
  "clay",
  "claude-code",
  "n8n",
  "instantly",
  "hubspot",
  "heyreach",
  "trigify",
  "apollo-io",
];

/** "GTM stacks" block. */
export const STACKS_SHOWN = 8;
/** Only show stacks with at least this many tools in the ACTIVE stack. */
export const STACK_MIN_TOOLS = 15;
/** Tool logos shown per stack card before the "+N". */
export const STACK_LOGOS_SHOWN = 6;

/** "Trending playbooks" block: playbooks + comparisons, most stars over the last N days. */
export const TRENDING_SHOWN = 6;
export const TRENDING_DAYS = 14;

/**
 * "Top tools used by GTMs" block: the parent categories shown on the homepage,
 * by their slug in the database. A category is hidden when it has fewer than 3
 * ranked tools (rankings rule: 5+ stacks to get a rank).
 */
export const HOME_CATEGORY_SLUGS = [
  "outbound",
  "data-enrichment",
  "ai-automation",
  "signals-intent",
  "crm-revops",
  "marketing",
  "sales-enablement",
  "productivity",
];

/**
 * Hides the "Rankings" nav link, the "View rankings" button and the "See all"
 * links when false.
 */
export const SHOW_RANKING_LINKS = true;

/**
 * The Explore stacks page (/stacks) does not exist yet. While this is false the
 * "Stacks" nav link and the "Explore stacks" button are hidden, and in the
 * rankings the "in stacks" numbers and the Used by "+N" are plain text.
 */
export const SHOW_STACKS_LINKS = false;

/** Site URLs used on the homepage. */
export const HOME_ROUTES = {
  search: "/search",
  /** A chip links to the tool by its configured slug. */
  tool: (slug: string) => `/tool/${encodeURIComponent(slug)}`,
  profile: (username: string) => `/${username}`,
  post: (username: string, slug: string) => `/${username}/${slug}`,
  stacks: "/stacks", // Explore stacks page: not built yet
  playbooks: "/playbooks",
  tools: "/tools",
  rankings: "/rankings",
  // A visitor who is not signed in has no stack to add to yet: log in first.
  addStack: "/login",
  login: "/login",
};
