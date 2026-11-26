// Rankings data layer (server side): fetches from the API and hands the numbers
// to the pure logic in ./ranking.

import { cache } from "react";
import { fetchApi, fetchApiAuthenticated } from "@/lib/api";
import { getServerAuthState } from "@/lib/auth-server";
import { groupCategories } from "@/lib/category-groups";
import type { TopCategory } from "@/lib/homepage";
import { getUserStack } from "@/lib/tool";
import { createClient } from "@/utils/supabase/server";
import {
  buildCategoryTree,
  buildTopGroups,
  computeRanking,
  scopeSlug,
  toolsInScope,
} from "./ranking";
import type {
  RankingCategory,
  RankingData,
  RankingParams,
  RankingResult,
  RankingScope,
  TopToolsGroup,
  UsedByUser,
  Viewer,
} from "./types";

/** The data is cached for 5 minutes, like the public API responses behind it. */
const REVALIDATE_SECONDS = 300;

/** The most categories GET /homepage/top-categories returns (the handler caps it). */
const CATEGORY_LIMIT = 100;

/**
 * Every ranked tool with its counts, and the stack count of every scope. Throws
 * when the API fails: a ranking page has nothing to show without it.
 */
export const getRankingData = cache(async (): Promise<RankingData> => {
  const response = await fetchApi("/rankings/tools", {
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!response.ok) throw new Error(`Failed to fetch the ranking data: ${response.status}`);
  return response.json();
});

/** The parents and their subcategories, from the database. Throws when the API fails. */
export const getCategoryTree = cache(async (): Promise<RankingCategory[]> => {
  const response = await fetchApi(`/homepage/top-categories?limit=${CATEGORY_LIMIT}`, {
    next: { revalidate: REVALIDATE_SECONDS },
  });
  if (!response.ok) throw new Error(`Failed to fetch the categories: ${response.status}`);
  const categories: TopCategory[] = await response.json();
  return buildCategoryTree(groupCategories(categories));
});

/**
 * The signed-in visitor and how many tools are in their active stack, or null
 * when logged out. Never throws: when the stack cannot be read the count is
 * null, and the banner stays hidden.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  try {
    const auth = await getServerAuthState();
    if (auth.status !== "authenticated") return null;
    const { username } = auth.user;
    try {
      const { tools } = await getUserStack(username);
      return { username, activeStackCount: tools.length };
    } catch (error) {
      console.error("Could not read the viewer's stack:", error);
      return { username, activeStackCount: null };
    }
  } catch (error) {
    console.error("Could not read the viewer:", error);
    return null;
  }
});

/**
 * Up to 3 people per tool for the "Used by" avatars. The order depends on who
 * is asking, so a signed-in visitor's request is never cached. When it fails the
 * page renders without avatars.
 */
async function getUsedBy(
  toolIds: string[],
  signedIn: boolean,
): Promise<Map<string, UsedByUser[]>> {
  if (toolIds.length === 0) return new Map();
  const path = `/rankings/used-by?ids=${toolIds.map(encodeURIComponent).join(",")}`;
  try {
    const response = signedIn
      ? await fetchApiAuthenticated(await createClient(), path, { cache: "no-store" })
      : await fetchApi(path, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!response.ok) throw new Error(`status ${response.status}`);
    const body: Record<string, UsedByUser[]> = await response.json();
    return new Map(Object.entries(body));
  } catch (error) {
    console.error("Could not fetch who uses these tools:", error);
    return new Map();
  }
}

/** One ranking page: the numbers, the people behind them and the scope's stack count. */
export async function getRanking(
  scope: RankingScope,
  params: RankingParams,
  viewer: Viewer,
): Promise<RankingResult> {
  const data = await getRankingData();
  const rows = computeRanking(toolsInScope(data.tools, scope), scope, params);
  const usedBy = await getUsedBy(
    rows.tools.map((t) => t.id),
    viewer !== null,
  );

  return {
    ...rows,
    tools: rows.tools.map((t) => ({ ...t, usedBy: usedBy.get(t.id) ?? [] })),
    totalStacks: data.stack_counts[scopeSlug(scope)] ?? 0,
    updatedAt: new Date(),
  };
}

/** How many tools are ranked and which page is shown, for the page's metadata. */
export async function getRankingSummary(
  scope: RankingScope,
  params: RankingParams,
): Promise<{ totalRanked: number; page: number }> {
  const data = await getRankingData();
  const { totalRanked, page } = computeRanking(toolsInScope(data.tools, scope), scope, params);
  return { totalRanked, page };
}

/**
 * The top 3 cards: one per category on "all", one per subcategory on a category
 * page. Throws when the API fails, so a caller that can live without them (the
 * homepage) must catch it.
 */
export async function getTopToolsByGroup(scope: RankingScope): Promise<TopToolsGroup[]> {
  const [data, tree] = await Promise.all([getRankingData(), getCategoryTree()]);
  return buildTopGroups(data.tools, scope, tree);
}
