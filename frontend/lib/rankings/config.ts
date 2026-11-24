// Rankings: settings in one place.

/** A tool needs at least this many active stacks to get a rank. */
export const MIN_STACKS_TO_RANK = 5;

/** Tools per page in a ranking table. */
export const PAGE_SIZE = 25;

/**
 * Hidden for launch, turn on once there is enough data (Max, 23 Nov 2026):
 * - the "30 days" and "Kept by" columns
 * - the "Most popular tool combos" and "Who switched to what" blocks (not built yet)
 */
export const SHOW_LATER = false;

/** Default sort of every ranking. */
export const DEFAULT_SORT = "stacks" as const;
export const DEFAULT_DIR = "desc" as const;

/**
 * Site URLs used by the rankings.
 * The /stacks filter does not exist yet (the Explore stacks page is not built):
 * the links to it are switched off by SHOW_STACKS_LINKS in lib/home/config.ts.
 */
export const ROUTES = {
  rankings: "/rankings",
  profile: (username: string) => `/${username}`,
  /** The user's own stack tab, where they add tools. */
  stackTab: (username: string) => `/${username}?tab=stack`,
  stacksWithTool: (toolId: string) => `/stacks?tool=${encodeURIComponent(toolId)}`,
  /** /playbooks filters on the tool's id. */
  playbooksWithTool: (toolId: string) => `/playbooks?tool=${encodeURIComponent(toolId)}`,
  login: "/login",
};

/** Used for canonical URLs and JSON-LD. */
export const SITE_URL = "https://stackhub.me";
