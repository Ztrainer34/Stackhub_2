import { describe, it, expect } from "vitest";
import {
  categoryHref,
  subcategoryHref,
  buildCategoryTree,
  findCategory,
  findSubcategory,
  scopeSlug,
  toolsInScope,
  computeRanking,
  groupNote,
  buildTopGroups,
  showStackBanner,
  stackBannerHref,
} from "@/lib/rankings/ranking";
import { MIN_STACKS_TO_RANK, PAGE_SIZE } from "@/lib/rankings/config";
import type { CategoryGroup } from "@/lib/category-groups";
import type {
  ApiRankingTool,
  RankingParams,
  RankingScope,
  ToolStatsRow,
} from "@/lib/rankings/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A category group as the page reads it. Only name and slug matter here. */
function group(name: string, slug: string, subs: [string, string][]): CategoryGroup {
  return {
    name,
    slug,
    categories: subs.map(([n, s]) => ({ name: n, slug: s })),
  } as unknown as CategoryGroup;
}

const GROUPS: CategoryGroup[] = [
  group("Outbound", "outbound", [
    ["Cold email", "cold-email"],
    ["LinkedIn", "linkedin"],
  ]),
  group("Marketing", "marketing", [["SEO", "seo"]]),
];

const TREE = buildCategoryTree(GROUPS);
const OUTBOUND = TREE[0];

const ALL: RankingScope = { level: "all" };
const CAT: RankingScope = { level: "category", category: OUTBOUND };
const SUB: RankingScope = {
  level: "subcategory",
  category: OUTBOUND,
  sub: OUTBOUND.subcategories[0], // cold-email
};

/** [parentSlug, subSlug] pairs -> the API's category shape. */
function cats(...pairs: [string, string][]) {
  return pairs.map(([parent, sub]) => ({
    name: `Sub ${sub}`,
    slug: sub,
    parent_name: `Parent ${parent}`,
    parent_slug: parent,
  }));
}

function apiTool(
  id: string,
  stacks: number,
  categories: [string, string][] = [],
  extra: Partial<ApiRankingTool> = {},
): ApiRankingTool {
  return {
    id,
    name: id,
    logo_url: "",
    stacks,
    playbooks: 0,
    saved: 0,
    categories: cats(...categories),
    ...extra,
  };
}

function row(id: string, stacks: number, extra: Partial<ToolStatsRow> = {}): ToolStatsRow {
  return {
    id,
    name: id,
    logoUrl: null,
    stacks,
    playbooks: 0,
    savedForLater: 0,
    trend30d: null,
    keptRate: null,
    labels: [],
    ...extra,
  };
}

const DEFAULT_PARAMS: RankingParams = { sort: "stacks", dir: "desc", page: 1 };
const params = (p: Partial<RankingParams> = {}): RankingParams => ({ ...DEFAULT_PARAMS, ...p });

/** n ranked rows t01..tNN, stacks descending from 100 so the order is stable. */
function rankedRows(n: number): ToolStatsRow[] {
  return Array.from({ length: n }, (_, i) =>
    row(`t${String(i + 1).padStart(2, "0")}`, 100 - i),
  );
}

// ---------------------------------------------------------------------------

describe("ranking constants", () => {
  it("needs 5 stacks to rank and shows 25 tools per page", () => {
    expect(MIN_STACKS_TO_RANK).toBe(5);
    expect(PAGE_SIZE).toBe(25);
  });
});

describe("categoryHref / subcategoryHref", () => {
  it("links a parent to /rankings/{parent}", () => {
    expect(categoryHref({ slug: "outbound" })).toBe("/rankings/outbound");
  });

  it("links a subcategory to /rankings/{parent}/{sub}", () => {
    expect(subcategoryHref({ slug: "outbound" }, { slug: "cold-email" })).toBe(
      "/rankings/outbound/cold-email",
    );
  });
});

describe("categoryHref / subcategoryHref encoding", () => {
  // A slug comes from the database; a space or slash in it would otherwise
  // change the path (an extra segment) or break the link.
  it("percent-encodes a parent slug that is not URL-safe", () => {
    expect(categoryHref({ slug: "a b/c" })).toBe("/rankings/a%20b%2Fc");
  });

  it("percent-encodes each segment of a subcategory link separately", () => {
    expect(subcategoryHref({ slug: "a b" }, { slug: "c/d" })).toBe("/rankings/a%20b/c%2Fd");
  });

  it("leaves a normal slug untouched", () => {
    expect(categoryHref({ slug: "data-enrichment" })).toBe("/rankings/data-enrichment");
  });
});

describe("buildCategoryTree", () => {
  it("keeps parents and their subcategories in the order given", () => {
    expect(TREE).toEqual([
      {
        name: "Outbound",
        slug: "outbound",
        subcategories: [
          { name: "Cold email", slug: "cold-email" },
          { name: "LinkedIn", slug: "linkedin" },
        ],
      },
      { name: "Marketing", slug: "marketing", subcategories: [{ name: "SEO", slug: "seo" }] },
    ]);
  });

  it("ignores the group with an empty slug (categories that have no parent)", () => {
    const tree = buildCategoryTree([
      ...GROUPS,
      group("", "", [["Orphan", "orphan"]]),
    ]);
    expect(tree.map((c) => c.slug)).toEqual(["outbound", "marketing"]);
  });

  it("returns an empty tree for no groups", () => {
    expect(buildCategoryTree([])).toEqual([]);
  });
});

describe("findCategory / findSubcategory", () => {
  it("finds a parent by slug", () => {
    expect(findCategory(TREE, "marketing")?.name).toBe("Marketing");
  });

  it("returns undefined for an unknown parent", () => {
    expect(findCategory(TREE, "nope")).toBeUndefined();
  });

  it("finds a subcategory together with its parent", () => {
    const found = findSubcategory(TREE, "outbound", "linkedin");
    expect(found?.category.slug).toBe("outbound");
    expect(found?.sub.slug).toBe("linkedin");
  });

  it("returns undefined when the subcategory belongs to a different parent", () => {
    // /rankings/marketing/linkedin must 404, not quietly show the Outbound page.
    expect(findSubcategory(TREE, "marketing", "linkedin")).toBeUndefined();
  });

  it("returns undefined when the parent is unknown", () => {
    expect(findSubcategory(TREE, "nope", "linkedin")).toBeUndefined();
  });

  it("returns undefined when the subcategory is unknown", () => {
    expect(findSubcategory(TREE, "outbound", "nope")).toBeUndefined();
  });
});

describe("scopeSlug", () => {
  it("is empty for all", () => {
    expect(scopeSlug(ALL)).toBe("");
  });

  it("is the category slug for a category", () => {
    expect(scopeSlug(CAT)).toBe("outbound");
  });

  it("is the subcategory slug, not the parent's, for a subcategory", () => {
    expect(scopeSlug(SUB)).toBe("cold-email");
  });
});

describe("toolsInScope", () => {
  describe("scope: all", () => {
    it("returns every tool exactly once, even when it has several categories", () => {
      const tools = [
        apiTool("a", 10, [["outbound", "cold-email"], ["outbound", "linkedin"]]),
        apiTool("b", 10, [["marketing", "seo"]]),
        apiTool("c", 10),
      ];
      expect(toolsInScope(tools, ALL).map((r) => r.id)).toEqual(["a", "b", "c"]);
    });

    it("carries the numbers over (saved becomes savedForLater)", () => {
      const [r] = toolsInScope(
        [apiTool("a", 7, [], { name: "Alpha", playbooks: 3, saved: 11 })],
        ALL,
      );
      expect(r).toMatchObject({ id: "a", name: "Alpha", stacks: 7, playbooks: 3, savedForLater: 11 });
    });

    it("labels a tool with the parent of its FIRST (main) category only", () => {
      const [r] = toolsInScope(
        [apiTool("a", 10, [["marketing", "seo"], ["outbound", "cold-email"]])],
        ALL,
      );
      expect(r.labels).toEqual([{ name: "Parent marketing", href: "/rankings/marketing" }]);
    });

    it("gives a tool with no categories no label", () => {
      const [r] = toolsInScope([apiTool("a", 10)], ALL);
      expect(r.labels).toEqual([]);
    });
  });

  describe("scope: category", () => {
    const tools = [
      apiTool("one-sub", 10, [["outbound", "cold-email"]]),
      apiTool("two-subs", 10, [["outbound", "cold-email"], ["outbound", "linkedin"]]),
      apiTool("other-parent", 10, [["marketing", "seo"]]),
      apiTool("none", 10),
      apiTool("both-parents", 10, [["marketing", "seo"], ["outbound", "linkedin"]]),
    ];

    it("keeps tools with at least one subcategory of the parent, and drops the rest", () => {
      expect(toolsInScope(tools, CAT).map((r) => r.id).sort()).toEqual(
        ["both-parents", "one-sub", "two-subs"],
      );
    });

    it("lists a tool ONCE even when it is in several subcategories of the parent", () => {
      const ids = toolsInScope(tools, CAT).map((r) => r.id);
      expect(ids.filter((id) => id === "two-subs")).toHaveLength(1);
    });

    it("labels each tool with its subcategories inside this parent, linking to them", () => {
      const r = toolsInScope(tools, CAT).find((x) => x.id === "two-subs")!;
      const hrefs = r.labels.map((l) => l.href).sort();
      expect(hrefs).toEqual(["/rankings/outbound/cold-email", "/rankings/outbound/linkedin"]);
    });

    it("leaves another parent's subcategories out of the labels", () => {
      const r = toolsInScope(tools, CAT).find((x) => x.id === "both-parents")!;
      expect(r.labels.map((l) => l.href)).toEqual(["/rankings/outbound/linkedin"]);
    });
  });

  describe("scope: subcategory", () => {
    it("keeps tools in that subcategory and drops those in a sibling", () => {
      const tools = [
        apiTool("in", 10, [["outbound", "cold-email"]]),
        apiTool("sibling", 10, [["outbound", "linkedin"]]),
      ];
      expect(toolsInScope(tools, SUB).map((r) => r.id)).toEqual(["in"]);
    });

    it("requires the subcategory to be under THIS parent, not just share the slug", () => {
      const tools = [
        apiTool("right", 10, [["outbound", "cold-email"]]),
        apiTool("same-slug-other-parent", 10, [["marketing", "cold-email"]]),
      ];
      expect(toolsInScope(tools, SUB).map((r) => r.id)).toEqual(["right"]);
    });

    it("shows no labels", () => {
      const [r] = toolsInScope([apiTool("in", 10, [["outbound", "cold-email"]])], SUB);
      expect(r.labels).toEqual([]);
    });
  });

  describe("logo", () => {
    it("turns an empty logo_url into null", () => {
      const [r] = toolsInScope([apiTool("a", 10, [], { logo_url: "" })], ALL);
      expect(r.logoUrl).toBeNull();
    });

    it("keeps a real logo_url", () => {
      const [r] = toolsInScope([apiTool("a", 10, [], { logo_url: "https://x.test/a.png" })], ALL);
      expect(r.logoUrl).toBe("https://x.test/a.png");
    });
  });

  it("returns nothing for no tools", () => {
    expect(toolsInScope([], ALL)).toEqual([]);
  });
});

describe("computeRanking", () => {
  describe("who gets a rank", () => {
    it("ranks a tool with exactly 5 stacks and not one with 4", () => {
      // The boundary: 5 is in, 4 is out.
      const out = computeRanking([row("five", 5), row("four", 4)], ALL, params());
      expect(out.tools.map((t) => t.id)).toEqual(["five"]);
      expect(out.totalRanked).toBe(1);
    });

    it("counts only ranked tools in totalRanked", () => {
      const out = computeRanking(
        [row("a", 9), row("b", 8), row("c", 3), row("d", 1)],
        ALL,
        params(),
      );
      expect(out.totalRanked).toBe(2);
    });
  });

  describe("sorting and rank numbers", () => {
    it("sorts by stacks descending by default, rank 1 being the most stacks", () => {
      const out = computeRanking([row("low", 6), row("high", 20), row("mid", 10)], ALL, params());
      expect(out.tools.map((t) => [t.id, t.rank])).toEqual([
        ["high", 1],
        ["mid", 2],
        ["low", 3],
      ]);
    });

    // In these two tests the other columns would give the OPPOSITE order, so a
    // sort that reads the wrong column cannot pass by accident.
    it("ranks by the stacks number when playbooks point the other way", () => {
      const out = computeRanking(
        [row("few-stacks", 6, { playbooks: 99 }), row("many-stacks", 30, { playbooks: 0 })],
        ALL,
        params({ sort: "stacks" }),
      );
      expect(out.tools.map((t) => t.id)).toEqual(["many-stacks", "few-stacks"]);
    });

    it("ranks by the stacks number when saved points the other way", () => {
      const out = computeRanking(
        [row("few-stacks", 6, { savedForLater: 99 }), row("many-stacks", 30, { savedForLater: 0 })],
        ALL,
        params({ sort: "stacks" }),
      );
      expect(out.tools.map((t) => t.id)).toEqual(["many-stacks", "few-stacks"]);
    });

    it("ranks by playbooks when sorted by playbooks, even against stacks", () => {
      const out = computeRanking(
        [row("many-stacks", 50, { playbooks: 1 }), row("many-playbooks", 6, { playbooks: 40 })],
        ALL,
        params({ sort: "playbooks" }),
      );
      expect(out.tools.map((t) => [t.id, t.rank])).toEqual([
        ["many-playbooks", 1],
        ["many-stacks", 2],
      ]);
    });

    it("ranks by saved-for-later when sorted by saved", () => {
      const out = computeRanking(
        [row("a", 50, { savedForLater: 2 }), row("b", 6, { savedForLater: 9 })],
        ALL,
        params({ sort: "saved" }),
      );
      expect(out.tools.map((t) => t.id)).toEqual(["b", "a"]);
    });

    it("does not rank a tool below 5 stacks even when it tops the sorted column", () => {
      const out = computeRanking(
        [row("small", 4, { playbooks: 999 }), row("big", 5, { playbooks: 1 })],
        ALL,
        params({ sort: "playbooks" }),
      );
      expect(out.tools.map((t) => t.id)).toEqual(["big"]);
    });
  });

  describe("ties", () => {
    it("breaks a tie on the sorted column by more stacks first", () => {
      const out = computeRanking(
        [row("fewer", 6, { playbooks: 5 }), row("more", 30, { playbooks: 5 })],
        ALL,
        params({ sort: "playbooks" }),
      );
      expect(out.tools.map((t) => t.id)).toEqual(["more", "fewer"]);
    });

    it("breaks a remaining tie by name A-Z", () => {
      const out = computeRanking(
        [row("zeta", 10), row("alpha", 10), row("mid", 10)],
        ALL,
        params(),
      );
      expect(out.tools.map((t) => t.id)).toEqual(["alpha", "mid", "zeta"]);
    });

    it("gives tied tools distinct, consecutive rank numbers", () => {
      const out = computeRanking([row("b", 10), row("a", 10)], ALL, params());
      expect(out.tools.map((t) => t.rank)).toEqual([1, 2]);
    });
  });

  describe("direction", () => {
    it("reverses the list for asc", () => {
      const out = computeRanking([row("a", 30), row("b", 20), row("c", 10)], ALL, params({ dir: "asc" }));
      expect(out.tools.map((t) => t.id)).toEqual(["c", "b", "a"]);
    });

    it("keeps each tool's rank number when reversed", () => {
      // The rank is the tool's standing, not its row position.
      const out = computeRanking([row("a", 30), row("b", 20), row("c", 10)], ALL, params({ dir: "asc" }));
      expect(out.tools.map((t) => [t.id, t.rank])).toEqual([
        ["c", 3],
        ["b", 2],
        ["a", 1],
      ]);
    });

    it("pages the reversed list: asc page 1 holds the 25 lowest-ranked tools", () => {
      const out = computeRanking(rankedRows(30), ALL, params({ dir: "asc" }));
      expect(out.tools).toHaveLength(25);
      expect(out.tools[0].rank).toBe(30);
      expect(out.tools[24].rank).toBe(6);
    });

    it("asc page 2 holds the best-ranked tools", () => {
      const out = computeRanking(rankedRows(30), ALL, params({ dir: "asc", page: 2 }));
      expect(out.tools.map((t) => t.rank)).toEqual([5, 4, 3, 2, 1]);
    });
  });

  describe("paging", () => {
    it("shows 25 tools on a full page, ranked from 1", () => {
      const out = computeRanking(rankedRows(60), ALL, params());
      expect(out.tools).toHaveLength(25);
      expect(out.tools[0].rank).toBe(1);
      expect(out.tools[24].rank).toBe(25);
    });

    it("continues the rank numbers on page 2", () => {
      const out = computeRanking(rankedRows(60), ALL, params({ page: 2 }));
      expect(out.tools[0].rank).toBe(26);
      expect(out.tools[24].rank).toBe(50);
    });

    it("shows the remainder on the last page", () => {
      const out = computeRanking(rankedRows(60), ALL, params({ page: 3 }));
      expect(out.tools).toHaveLength(10);
    });

    it("reports 3 pages for 60 tools", () => {
      expect(computeRanking(rankedRows(60), ALL, params()).totalPages).toBe(3);
    });

    it("fits exactly 25 tools on one page", () => {
      expect(computeRanking(rankedRows(25), ALL, params()).totalPages).toBe(1);
    });

    it("needs a second page for 26 tools", () => {
      const out = computeRanking(rankedRows(26), ALL, params({ page: 2 }));
      expect(out.totalPages).toBe(2);
      expect(out.tools).toHaveLength(1);
    });

    it("clamps a page past the end to the last page", () => {
      const out = computeRanking(rankedRows(60), ALL, params({ page: 99 }));
      expect(out.page).toBe(3);
      expect(out.tools[0].rank).toBe(51);
    });

    it("clamps page 0 up to page 1", () => {
      expect(computeRanking(rankedRows(60), ALL, params({ page: 0 })).page).toBe(1);
    });

    it("clamps a negative page up to page 1", () => {
      expect(computeRanking(rankedRows(60), ALL, params({ page: -4 })).page).toBe(1);
    });

    it("shows the first page of tools for page 0", () => {
      const out = computeRanking(rankedRows(60), ALL, params({ page: 0 }));
      expect(out.tools[0].rank).toBe(1);
    });

    it("reports the page actually shown", () => {
      expect(computeRanking(rankedRows(60), ALL, params({ page: 2 })).page).toBe(2);
    });
  });

  describe("empty input", () => {
    it("has one page and no tools when there are no rows", () => {
      const out = computeRanking([], ALL, params());
      expect(out).toMatchObject({ tools: [], totalRanked: 0, totalPages: 1, page: 1, unranked: [] });
    });

    it("has one page when every tool is below the threshold", () => {
      const out = computeRanking([row("a", 3), row("b", 1)], ALL, params());
      expect(out).toMatchObject({ tools: [], totalRanked: 0, totalPages: 1 });
    });

    it("clamps any requested page to 1 when empty", () => {
      expect(computeRanking([], ALL, params({ page: 7 })).page).toBe(1);
    });
  });

  describe("unranked tools (1 to 4 stacks)", () => {
    const low = [row("b-three", 3), row("a-three", 3), row("four", 4), row("one", 1)];

    it("lists them on a subcategory page", () => {
      const out = computeRanking([row("ranked", 9), ...low], SUB, params());
      expect(out.unranked).toHaveLength(4);
    });

    it("orders them by most stacks first, then name A-Z", () => {
      const out = computeRanking([row("ranked", 9), ...low], SUB, params());
      expect(out.unranked.map((u) => u.id)).toEqual(["four", "a-three", "b-three", "one"]);
    });

    it("orders them by stacks even when the table is sorted by another column", () => {
      const out = computeRanking(
        [row("ranked", 9), row("x", 2, { playbooks: 99 }), row("y", 4, { playbooks: 0 })],
        SUB,
        params({ sort: "playbooks" }),
      );
      expect(out.unranked.map((u) => u.id)).toEqual(["y", "x"]);
    });

    it("exposes id, name, logo and stacks", () => {
      const out = computeRanking([row("u", 2, { name: "Unranked", logoUrl: "l.png" })], SUB, params());
      expect(out.unranked[0]).toMatchObject({ id: "u", name: "Unranked", logoUrl: "l.png", stacks: 2 });
    });

    it("never lists a ranked tool as unranked (exactly 5 stacks is ranked)", () => {
      // Boundary pair: exactly 5 ranked and exactly 4 unranked.
      const rows = [
        ...Array.from({ length: 5 }, (_, i) => row(`r${i}`, 5)),
        ...Array.from({ length: 4 }, (_, i) => row(`u${i}`, 4)),
      ];
      const out = computeRanking(rows, SUB, params());
      expect(out.totalRanked).toBe(5);
      expect(out.unranked).toHaveLength(4);
      expect(out.unranked.every((u) => u.stacks === 4)).toBe(true);
    });

    // 0 stacks is below the unranked range (1 to 4): such a tool is not listed
    // anywhere, ranked or unranked.
    it("never lists a tool with 0 stacks, not even as unranked", () => {
      const out = computeRanking([row("ranked", 9), row("zero", 0), row("low", 3)], SUB, params());
      expect(out.unranked.map((u) => u.id)).toEqual(["low"]);
    });

    it("never ranks a tool with 0 stacks", () => {
      const out = computeRanking([row("ranked", 9), row("zero", 0)], SUB, params());
      expect(out.tools.map((t) => t.id)).toEqual(["ranked"]);
      expect(out.totalRanked).toBe(1);
    });

    it("shows nothing when every tool has 0 stacks", () => {
      const out = computeRanking([row("z1", 0), row("z2", 0)], SUB, params());
      expect(out).toMatchObject({ tools: [], unranked: [], totalRanked: 0, totalPages: 1 });
    });

    it("is empty on a category page", () => {
      expect(computeRanking([row("ranked", 9), ...low], CAT, params()).unranked).toEqual([]);
    });

    it("is empty on the all page", () => {
      expect(computeRanking([row("ranked", 9), ...low], ALL, params()).unranked).toEqual([]);
    });

    it("is empty on a page that is not the last", () => {
      const out = computeRanking([...rankedRows(30), ...low], SUB, params({ page: 1 }));
      expect(out.unranked).toEqual([]);
    });

    it("appears on the last page", () => {
      const out = computeRanking([...rankedRows(30), ...low], SUB, params({ page: 2 }));
      expect(out.unranked).toHaveLength(4);
    });

    it("appears when a too-high page is clamped to the last page", () => {
      const out = computeRanking([...rankedRows(30), ...low], SUB, params({ page: 50 }));
      expect(out.unranked).toHaveLength(4);
    });

    it("appears on the single page when nothing at all is ranked", () => {
      const out = computeRanking(low, SUB, params());
      expect(out.tools).toEqual([]);
      expect(out.unranked).toHaveLength(4);
    });
  });

  describe("inputs", () => {
    it("does not mutate the rows array or the rows in it", () => {
      // Frozen input turns an in-place sort/reverse into a thrown TypeError.
      const rows = [row("c", 6), row("a", 30), row("b", 3), row("d", 12)];
      const before = JSON.parse(JSON.stringify(rows));
      rows.forEach((r) => Object.freeze(r));
      Object.freeze(rows);

      computeRanking(rows, SUB, params({ dir: "asc" }));

      expect(JSON.parse(JSON.stringify(rows))).toEqual(before);
    });
  });
});

describe("groupNote", () => {
  it("is null once 3 tools are ranked", () => {
    expect(groupNote(3)).toBeNull();
  });

  it("is null for more than 3", () => {
    expect(groupNote(10)).toBeNull();
  });

  it("says there is not enough data when no tool is ranked", () => {
    expect(groupNote(0)).toMatch(/^Not enough data yet/);
  });

  it("says one tool, in the singular", () => {
    expect(groupNote(1)).toBe("Only 1 tool ranked so far.");
  });

  it("says two tools, in the plural", () => {
    expect(groupNote(2)).toBe("Only 2 tools ranked so far.");
  });
});

describe("buildTopGroups", () => {
  const tools = [
    apiTool("A", 30, [["outbound", "cold-email"]]),
    apiTool("B", 20, [["outbound", "cold-email"]]),
    apiTool("C", 12, [["outbound", "linkedin"]]),
    apiTool("D", 8, [["outbound", "cold-email"]]),
    apiTool("E", 4, [["outbound", "cold-email"]]), // below the threshold
    apiTool("F", 9, [["marketing", "seo"]]),
  ];

  describe("scope: all", () => {
    const groups = buildTopGroups(tools, ALL, TREE);

    it("makes one group per parent, in tree order", () => {
      expect(groups.map((g) => g.slug)).toEqual(["outbound", "marketing"]);
    });

    it("names and links each group to its parent's ranking", () => {
      expect(groups[0]).toMatchObject({
        name: "Outbound",
        slug: "outbound",
        href: "/rankings/outbound",
      });
    });

    it("shows the top 3 by stacks, ranked 1 to 3", () => {
      expect(groups[0].tools.map((t) => [t.rank, t.id, t.stacks])).toEqual([
        [1, "A", 30],
        [2, "B", 20],
        [3, "C", 12],
      ]);
    });

    it("has no note when 3 tools are ranked", () => {
      expect(groups[0].note).toBeNull();
    });

    it("explains a group with a single ranked tool", () => {
      expect(groups[1].tools.map((t) => t.id)).toEqual(["F"]);
      expect(groups[1].note).toBe("Only 1 tool ranked so far.");
    });
  });

  it("leaves tools below 5 stacks out", () => {
    const groups = buildTopGroups(
      [apiTool("x", 4, [["marketing", "seo"]]), apiTool("y", 5, [["marketing", "seo"]])],
      ALL,
      TREE,
    );
    expect(groups[1].tools.map((t) => t.id)).toEqual(["y"]);
  });

  it("still returns a group, with a not-enough-data note, when nothing ranks", () => {
    const groups = buildTopGroups([apiTool("x", 4, [["marketing", "seo"]])], ALL, TREE);
    expect(groups[1].tools).toEqual([]);
    expect(groups[1].note).toMatch(/^Not enough data yet/);
  });

  it("lists a tool once in a parent's group even when it is in two of its subcategories", () => {
    const groups = buildTopGroups(
      [apiTool("G", 50, [["outbound", "cold-email"], ["outbound", "linkedin"]])],
      ALL,
      TREE,
    );
    expect(groups[0].tools.map((t) => t.id)).toEqual(["G"]);
  });

  describe("scope: category", () => {
    const groups = buildTopGroups(tools, CAT, TREE);

    it("makes one group per subcategory of that parent", () => {
      expect(groups.map((g) => g.slug)).toEqual(["cold-email", "linkedin"]);
    });

    it("links each group to its subcategory ranking", () => {
      expect(groups[0]).toMatchObject({
        name: "Cold email",
        href: "/rankings/outbound/cold-email",
      });
    });

    it("fills each group from its own subcategory only, top by stacks", () => {
      expect(groups[0].tools.map((t) => t.id)).toEqual(["A", "B", "D"]);
      expect(groups[1].tools.map((t) => t.id)).toEqual(["C"]);
    });

    it("notes the group that has fewer than 3 ranked tools", () => {
      expect(groups[0].note).toBeNull();
      expect(groups[1].note).toBe("Only 1 tool ranked so far.");
    });

    it("does not pull in another parent's subcategories", () => {
      expect(groups.some((g) => g.slug === "seo")).toBe(false);
    });
  });

  it("returns no groups on a subcategory page", () => {
    expect(buildTopGroups(tools, SUB, TREE)).toEqual([]);
  });

  it("caps a group at 3 tools however many are ranked", () => {
    const many = ["a", "b", "c", "d", "e"].map((id, i) =>
      apiTool(id, 50 - i, [["marketing", "seo"]]),
    );
    const groups = buildTopGroups(many, ALL, TREE);
    expect(groups[1].tools).toHaveLength(3);
  });
});

describe("showStackBanner", () => {
  it("shows for a logged-out visitor", () => {
    expect(showStackBanner(null)).toBe(true);
  });

  it("shows for a signed-in visitor with an empty stack", () => {
    expect(showStackBanner({ username: "ada", activeStackCount: 0 })).toBe(true);
  });

  it("hides once the visitor has a stack", () => {
    expect(showStackBanner({ username: "ada", activeStackCount: 1 })).toBe(false);
    expect(showStackBanner({ username: "ada", activeStackCount: 12 })).toBe(false);
  });

  it("hides when the count could not be read, rather than guessing", () => {
    expect(showStackBanner({ username: "ada", activeStackCount: null })).toBe(false);
  });
});

describe("stackBannerHref", () => {
  it("sends a logged-out visitor to /login", () => {
    expect(stackBannerHref(null)).toBe("/login");
  });

  it("sends a signed-in visitor to the stack tab of their profile", () => {
    expect(stackBannerHref({ username: "ada", activeStackCount: 0 })).toBe("/ada?tab=stack");
  });
});
