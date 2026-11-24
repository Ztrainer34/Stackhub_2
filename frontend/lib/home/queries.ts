// Homepage data layer (server side), for the logged-out landing page.

import { apiPath } from "@/lib/api-path";
import { fetchApi } from "@/lib/api";
import { getTopToolsByGroup } from "@/lib/rankings/queries";
import type { TopToolsGroup } from "@/lib/rankings/types";
import type { Tool } from "@/lib/tool";
import {
  CHIP_TOOL_SLUGS,
  HOME_CATEGORY_SLUGS,
  STACK_MIN_TOOLS,
  STACKS_SHOWN,
  TRENDING_DAYS,
  TRENDING_SHOWN,
} from "./config";
import type { ChipTool, HomePost, HomeStack } from "./types";

/** Public API data changes slowly: 5 minutes, like the API's own cache. */
const REVALIDATE = { next: { revalidate: 300 } } as const;

export type HomeData = {
  chips: ChipTool[];
  stacks: HomeStack[];
  posts: HomePost[];
  topTools: TopToolsGroup[];
};

/**
 * The homepage categories, in the order of `slugs`, and only those with a full
 * top 3 (a "ranking" of 1 or 2 tools looks weak on the homepage). Matched by the
 * group's slug.
 */
export function pickHomeCategories(groups: TopToolsGroup[], slugs: string[]): TopToolsGroup[] {
  const bySlug = new Map(groups.map((g) => [g.slug, g]));
  return slugs
    .map((s) => bySlug.get(s))
    .filter((g): g is TopToolsGroup => !!g && g.tools.length === 3);
}

/**
 * Everything the logged-out homepage needs, fetched in parallel. Each shelf
 * stands on its own: one that fails is logged and left empty, and its section
 * is hidden, rather than taking the whole page down.
 */
export async function getHomeData(): Promise<HomeData> {
  const [chips, stacks, posts, groups] = await Promise.allSettled([
    fetchChipTools(CHIP_TOOL_SLUGS),
    fetchHomeStacks(STACKS_SHOWN, STACK_MIN_TOOLS),
    fetchTrendingPosts(TRENDING_SHOWN, TRENDING_DAYS),
    getTopToolsByGroup({ level: "all" }),
  ]);

  const shelf = <T,>(result: PromiseSettledResult<T[]>, name: string): T[] => {
    if (result.status === "fulfilled") return result.value;
    console.error(`Homepage shelf unavailable (${name}):`, result.reason);
    return [];
  };

  return {
    chips: shelf(chips, "chips"),
    stacks: shelf(stacks, "stacks"),
    posts: shelf(posts, "trending posts"),
    topTools: pickHomeCategories(shelf(groups, "top tools"), HOME_CATEGORY_SLUGS),
  };
}

/**
 * Name and logo for each chip slug, in the same order. A slug that is missing,
 * hidden or fails to load is left out.
 */
async function fetchChipTools(slugs: string[]): Promise<ChipTool[]> {
  const chips = await Promise.all(
    slugs.map(async (slug): Promise<ChipTool | null> => {
      try {
        const response = await fetchApi(apiPath`/tool/${slug}`, REVALIDATE);
        if (!response.ok) return null;
        const tool: Pick<Tool, "name" | "logo_url" | "is_hidden"> = await response.json();
        if (tool.is_hidden) return null;
        return { slug, name: tool.name, logoUrl: tool.logo_url || null };
      } catch (error) {
        console.error(`Homepage chip "${slug}" unavailable:`, error);
        return null;
      }
    }),
  );
  return chips.filter((c): c is ChipTool => c !== null);
}

/** People and company pages with at least `minTools` tools in their active stack. */
async function fetchHomeStacks(limit: number, minTools: number): Promise<HomeStack[]> {
  const response = await fetchApi(
    `/stacks/featured?limit=${limit}&min_tools=${minTools}`,
    REVALIDATE,
  );
  if (!response.ok) throw new Error(`Failed to fetch featured stacks: ${response.status}`);
  return response.json();
}

/** Playbooks and comparisons with the most stars over the last `days` days. */
async function fetchTrendingPosts(limit: number, days: number): Promise<HomePost[]> {
  const response = await fetchApi(`/posts/trending?limit=${limit}&days=${days}`, REVALIDATE);
  if (!response.ok) throw new Error(`Failed to fetch trending posts: ${response.status}`);
  return response.json();
}
