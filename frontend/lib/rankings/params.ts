import { DEFAULT_DIR, DEFAULT_SORT, SHOW_LATER, SITE_URL } from "./config";
import type { RankingParams, SortDir, SortKey } from "./types";

type SearchParams = Record<string, string | string[] | undefined>;

const ALL_KEYS: SortKey[] = ["stacks", "playbooks", "saved", "trend", "kept"];
const LATER_KEYS: SortKey[] = ["trend", "kept"];

export function sortableKeys(): SortKey[] {
  return SHOW_LATER ? ALL_KEYS : ALL_KEYS.filter((k) => !LATER_KEYS.includes(k));
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Reads ?sort=&dir=&page= and falls back to safe defaults. */
export function parseRankingParams(sp: SearchParams): RankingParams {
  const rawSort = first(sp.sort) as SortKey | undefined;
  const sort = rawSort && sortableKeys().includes(rawSort) ? rawSort : DEFAULT_SORT;
  const dir: SortDir = first(sp.dir) === "asc" ? "asc" : "desc";
  // Number, not parseInt: "2.5" and "2abc" are not page numbers.
  const pageNum = Number(first(sp.page) ?? "1");
  const page = Number.isSafeInteger(pageNum) && pageNum > 0 ? pageNum : 1;
  return { sort, dir, page };
}

/** Builds a ranking URL. Default values are left out so the base URL stays clean. */
export function rankingHref(basePath: string, p: Partial<RankingParams>): string {
  const q = new URLSearchParams();
  if (p.sort && p.sort !== DEFAULT_SORT) q.set("sort", p.sort);
  if (p.dir && p.dir !== DEFAULT_DIR) q.set("dir", p.dir);
  if (p.page && p.page > 1) q.set("page", String(p.page));
  const s = q.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/** Header link: first click sorts high to low, a second click on the same column flips it. */
export function sortHref(basePath: string, current: RankingParams, key: SortKey): string {
  const dir: SortDir =
    current.sort === key ? (current.dir === "desc" ? "asc" : "desc") : "desc";
  return rankingHref(basePath, { sort: key, dir, page: 1 });
}

/** Absolute canonical URL: drops sort/dir (same content, different order), keeps the page number. */
export function canonicalPath(basePath: string, p: RankingParams): string {
  return SITE_URL + rankingHref(basePath, { page: p.page });
}
