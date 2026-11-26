// Ranking logic. PURE: no I/O, so it can be tested on its own.
//
// Rules (Max, 20 Nov 2026):
// - A tool needs MIN_STACKS_TO_RANK active stacks to get a rank.
// - The rank number follows the sort column: rank 1 = highest value of that
//   column. Flipping to low-to-high keeps each tool's rank number and reverses
//   the list.
// - Tools with 1 to 4 stacks are listed without a rank, on the last page of a
//   subcategory page only.
// - A category page lists a tool once, even if it is in several of its
//   subcategories. The same goes for /rankings.

import type { CategoryGroup } from "@/lib/category-groups";
import { MIN_STACKS_TO_RANK, PAGE_SIZE, ROUTES } from "./config";
import type {
  ApiRankingTool,
  RankedRow,
  RankingCategory,
  RankingPageRows,
  RankingParams,
  RankingScope,
  SortKey,
  ToolStatsRow,
  TopToolsGroup,
  UnrankedTool,
  Viewer,
} from "./types";

// ---------------------------------------------------------------------------
// Categories and links
// ---------------------------------------------------------------------------

export const categoryHref = (c: { slug: string }) =>
  `${ROUTES.rankings}/${encodeURIComponent(c.slug)}`;

export const subcategoryHref = (c: { slug: string }, s: { slug: string }) =>
  `${categoryHref(c)}/${encodeURIComponent(s.slug)}`;

/**
 * The category tree from the grouped categories of the database. Categories
 * without a parent (a group with an empty slug) are not rankings.
 */
export function buildCategoryTree(groups: CategoryGroup[]): RankingCategory[] {
  return groups
    .filter((g) => g.slug !== "")
    .map((g) => ({
      name: g.name,
      slug: g.slug,
      subcategories: g.categories.map((c) => ({ name: c.name, slug: c.slug })),
    }));
}

export function findCategory(
  tree: RankingCategory[],
  slug: string,
): RankingCategory | undefined {
  return tree.find((c) => c.slug === slug);
}

export function findSubcategory(
  tree: RankingCategory[],
  categorySlug: string,
  subSlug: string,
): { category: RankingCategory; sub: RankingCategory["subcategories"][number] } | undefined {
  const category = findCategory(tree, categorySlug);
  const sub = category?.subcategories.find((s) => s.slug === subSlug);
  return category && sub ? { category, sub } : undefined;
}

/** The key of a scope in the stack counts: "" for all, else the category or subcategory slug. */
export function scopeSlug(scope: RankingScope): string {
  switch (scope.level) {
    case "all":
      return "";
    case "category":
      return scope.category.slug;
    case "subcategory":
      return scope.sub.slug;
  }
}

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

function inScope(tool: ApiRankingTool, scope: RankingScope): boolean {
  switch (scope.level) {
    case "all":
      return true;
    case "category":
      return tool.categories.some((c) => c.parent_slug === scope.category.slug);
    case "subcategory":
      return tool.categories.some(
        (c) => c.slug === scope.sub.slug && c.parent_slug === scope.category.slug,
      );
  }
}

/**
 * Links shown under the tool name: on "all" the parent of the tool's main
 * category (the first one), on a category page its subcategories inside that
 * category, on a subcategory page none.
 */
function labelsFor(tool: ApiRankingTool, scope: RankingScope): ToolStatsRow["labels"] {
  switch (scope.level) {
    case "all": {
      const main = tool.categories[0];
      return main
        ? [{ name: main.parent_name, href: categoryHref({ slug: main.parent_slug }) }]
        : [];
    }
    case "category":
      return tool.categories
        .filter((c) => c.parent_slug === scope.category.slug)
        .map((c) => ({ name: c.name, href: subcategoryHref(scope.category, c) }));
    case "subcategory":
      return [];
  }
}

/** The tools of a scope, each once, as rows of numbers. */
export function toolsInScope(tools: ApiRankingTool[], scope: RankingScope): ToolStatsRow[] {
  return tools
    .filter((t) => inScope(t, scope))
    .map((t) => ({
      id: t.id,
      name: t.name,
      logoUrl: t.logo_url || null,
      stacks: t.stacks,
      playbooks: t.playbooks,
      savedForLater: t.saved,
      trend30d: null,
      keptRate: null,
      labels: labelsFor(t, scope),
    }));
}

// ---------------------------------------------------------------------------
// Sort, rank, paginate
// ---------------------------------------------------------------------------

function sortValue(t: ToolStatsRow, key: SortKey): number {
  switch (key) {
    case "stacks":
      return t.stacks;
    case "playbooks":
      return t.playbooks;
    case "saved":
      return t.savedForLater;
    case "trend":
      return t.trend30d ?? Number.NEGATIVE_INFINITY;
    case "kept":
      return t.keptRate ?? Number.NEGATIVE_INFINITY;
  }
}

/** High to low on the sort key, then most stacks, then name. */
function compareDesc(key: SortKey) {
  return (a: ToolStatsRow, b: ToolStatsRow) =>
    sortValue(b, key) - sortValue(a, key) ||
    b.stacks - a.stacks ||
    a.name.localeCompare(b.name);
}

/** Tools in 1 to 4 stacks, most stacks first, then name. */
function unrankedOf(rows: ToolStatsRow[]): UnrankedTool[] {
  return rows
    .filter((r) => r.stacks > 0 && r.stacks < MIN_STACKS_TO_RANK)
    .sort((a, b) => b.stacks - a.stacks || a.name.localeCompare(b.name))
    .map(({ id, name, logoUrl, stacks }) => ({ id, name, logoUrl, stacks }));
}

/** Filters out the unranked, sorts, numbers, flips and cuts one page. */
export function computeRanking(
  rows: ToolStatsRow[],
  scope: RankingScope,
  params: RankingParams,
): RankingPageRows {
  const ranked = rows
    .filter((r) => r.stacks >= MIN_STACKS_TO_RANK)
    .sort(compareDesc(params.sort));
  const rankById = new Map(ranked.map((r, i) => [r.id, i + 1]));
  const ordered = params.dir === "desc" ? ranked : [...ranked].reverse();

  const totalPages = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const page = Math.max(1, Math.min(params.page, totalPages));
  const tools: RankedRow[] = ordered
    .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
    .map((r) => ({ ...r, rank: rankById.get(r.id) ?? 0 }));

  // Listed without a rank, subcategory pages only, after the last ranked tool.
  const unranked =
    scope.level === "subcategory" && page === totalPages ? unrankedOf(rows) : [];

  return { tools, totalRanked: ranked.length, totalPages, page, unranked };
}

// ---------------------------------------------------------------------------
// Top 3 cards
// ---------------------------------------------------------------------------

export function groupNote(count: number): string | null {
  if (count >= 3) return null;
  if (count === 0)
    return `Not enough data yet: no tool is in ${MIN_STACKS_TO_RANK} stacks so far.`;
  return count === 1 ? "Only 1 tool ranked so far." : "Only 2 tools ranked so far.";
}

/**
 * Top 3 cards under the table, by active stacks. On /rankings: one card per
 * parent category. On a category page: one card per subcategory. None on a
 * subcategory page.
 */
export function buildTopGroups(
  tools: ApiRankingTool[],
  scope: RankingScope,
  tree: RankingCategory[],
): TopToolsGroup[] {
  const groups: { name: string; slug: string; href: string; scope: RankingScope }[] =
    scope.level === "all"
      ? tree.map((c) => ({
          name: c.name,
          slug: c.slug,
          href: categoryHref(c),
          scope: { level: "category", category: c },
        }))
      : scope.level === "category"
        ? scope.category.subcategories.map((s) => ({
            name: s.name,
            slug: s.slug,
            href: subcategoryHref(scope.category, s),
            scope: { level: "subcategory", category: scope.category, sub: s },
          }))
        : [];

  return groups.map((g) => {
    const top = toolsInScope(tools, g.scope)
      .filter((r) => r.stacks >= MIN_STACKS_TO_RANK)
      .sort(compareDesc("stacks"))
      .slice(0, 3)
      .map((r, i) => ({
        rank: i + 1,
        id: r.id,
        name: r.name,
        logoUrl: r.logoUrl,
        stacks: r.stacks,
      }));
    return { name: g.name, slug: g.slug, href: g.href, tools: top, note: groupNote(top.length) };
  });
}

// ---------------------------------------------------------------------------
// Banner
// ---------------------------------------------------------------------------

/** "Every stack counts. Is yours there?": logged-out visitors and people with an empty stack. */
export function showStackBanner(viewer: Viewer): boolean {
  return viewer === null || viewer.activeStackCount === 0;
}

/** Where the banner button goes: log in, or the viewer's own stack tab. */
export function stackBannerHref(viewer: Viewer): string {
  return viewer ? ROUTES.stackTab(viewer.username) : ROUTES.login;
}
