export type SortKey = "stacks" | "playbooks" | "saved" | "trend" | "kept";
export type SortDir = "asc" | "desc";

export type RankingParams = { sort: SortKey; dir: SortDir; page: number };

/** A parent category and its subcategories, as read from the database. */
export type RankingSubcategory = { name: string; slug: string };
export type RankingCategory = {
  name: string;
  slug: string;
  subcategories: RankingSubcategory[];
};

/** What the ranking covers. */
export type RankingScope =
  | { level: "all" }
  | { level: "category"; category: RankingCategory }
  | { level: "subcategory"; category: RankingCategory; sub: RankingSubcategory };

/** One category of a tool, as GET /rankings/tools returns it (main category first). */
export type ApiToolCategory = {
  name: string;
  slug: string;
  parent_name: string;
  parent_slug: string;
};

/** One tool of GET /rankings/tools: visible, with at least one active stack. */
export type ApiRankingTool = {
  id: string;
  name: string;
  logo_url: string;
  /** People with the tool in their ACTIVE stack (test accounts left out). */
  stacks: number;
  /** Published playbooks and comparisons tagged with the tool. */
  playbooks: number;
  /** People who saved the tool for later. Only this total is ever shown. */
  saved: number;
  categories: ApiToolCategory[];
};

/** The body of GET /rankings/tools. */
export type RankingData = {
  tools: ApiRankingTool[];
  /** Distinct people per scope: "" = all, otherwise a category or subcategory slug. */
  stack_counts: Record<string, number>;
};

/** One row of raw numbers per tool in a scope. */
export type ToolStatsRow = {
  id: string;
  name: string;
  logoUrl: string | null;
  /** People with the tool in their ACTIVE stack. */
  stacks: number;
  /** Published posts (playbooks + comparisons) tagged with the tool. */
  playbooks: number;
  /** People who saved the tool for later (private list: only this total is shown, never who). */
  savedForLater: number;
  /** Stacks gained minus stacks lost, last 30 days. Only used when SHOW_LATER is on. */
  trend30d: number | null;
  /** 0 to 1. Only used when SHOW_LATER is on. */
  keptRate: number | null;
  /** Links shown under the tool name (parent category on /rankings, subcategories on a category page). */
  labels: { name: string; href: string }[];
};

/** A person shown in the "Used by" avatars. */
export type UsedByUser = {
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type RankedRow = ToolStatsRow & { rank: number };

export type RankedTool = RankedRow & { usedBy: UsedByUser[] };

export type UnrankedTool = Pick<ToolStatsRow, "id" | "name" | "logoUrl" | "stacks">;

/** The pure part of a ranking: what is on the page, before "Used by" is added. */
export type RankingPageRows = {
  tools: RankedRow[];
  totalRanked: number;
  totalPages: number;
  /** The page shown, after clamping ?page= into range. */
  page: number;
  /** Only filled on subcategory pages, on the last page. */
  unranked: UnrankedTool[];
};

export type RankingResult = Omit<RankingPageRows, "tools"> & {
  tools: RankedTool[];
  /** Distinct people with at least one tool of this scope in their active stack. */
  totalStacks: number;
  updatedAt: Date;
};

/** A "top 3" card under the table. */
export type TopToolsGroup = {
  name: string;
  /** The category or subcategory slug. */
  slug: string;
  href: string;
  tools: { rank: number; id: string; name: string; logoUrl: string | null; stacks: number }[];
  /** Shown when fewer than 3 tools reach MIN_STACKS_TO_RANK. */
  note: string | null;
};

/**
 * The signed-in visitor. activeStackCount is null when it could not be read:
 * the banner is then hidden rather than guessed.
 */
export type Viewer = { username: string; activeStackCount: number | null } | null;
