import { describe, it, expect } from "vitest";
import {
  parseRankingParams,
  rankingHref,
  sortHref,
  canonicalPath,
} from "@/lib/rankings/params";
import type { RankingParams } from "@/lib/rankings/types";

/** Splits a link into its path and query, so tests do not depend on parameter order. */
function parts(href: string) {
  const [path, query = ""] = href.split("?");
  return { path, query: Object.fromEntries(new URLSearchParams(query)) };
}

const DEFAULTS: RankingParams = { sort: "stacks", dir: "desc", page: 1 };

describe("parseRankingParams", () => {
  it("returns the defaults for an empty query", () => {
    expect(parseRankingParams({})).toEqual(DEFAULTS);
  });

  describe("sort", () => {
    it.each(["stacks", "playbooks", "saved"] as const)("accepts %s", (sort) => {
      expect(parseRankingParams({ sort }).sort).toBe(sort);
    });

    it("falls back to stacks for an unknown column", () => {
      expect(parseRankingParams({ sort: "bogus" }).sort).toBe("stacks");
    });

    it("falls back to stacks for an empty value", () => {
      expect(parseRankingParams({ sort: "" }).sort).toBe("stacks");
    });

    // The columns exist in the type but are hidden for launch (SHOW_LATER is
    // false). A link to them must not produce a table sorted by a column nobody
    // can see.
    it("does not allow trend while the later columns are hidden", () => {
      expect(parseRankingParams({ sort: "trend" }).sort).toBe("stacks");
    });

    it("does not allow kept while the later columns are hidden", () => {
      expect(parseRankingParams({ sort: "kept" }).sort).toBe("stacks");
    });
  });

  describe("dir", () => {
    it("is asc only for the exact value asc", () => {
      expect(parseRankingParams({ dir: "asc" }).dir).toBe("asc");
    });

    it("is desc for desc", () => {
      expect(parseRankingParams({ dir: "desc" }).dir).toBe("desc");
    });

    it("is desc for anything else", () => {
      expect(parseRankingParams({ dir: "up" }).dir).toBe("desc");
      expect(parseRankingParams({ dir: "" }).dir).toBe("desc");
    });
  });

  describe("page", () => {
    it("reads a positive integer", () => {
      expect(parseRankingParams({ page: "3" }).page).toBe(3);
    });

    it.each(["0", "-1", "abc", "", "2.5", " "])("falls back to 1 for %j", (page) => {
      expect(parseRankingParams({ page }).page).toBe(1);
    });

    // Beyond Number.MAX_SAFE_INTEGER the value is no longer an exact integer;
    // it must not leak through as 1e20 into slicing and ?page= links.
    it("falls back to 1 for an absurdly large page", () => {
      expect(parseRankingParams({ page: "99999999999999999999" }).page).toBe(1);
    });

    it("defaults to 1 when absent", () => {
      expect(parseRankingParams({ page: undefined }).page).toBe(1);
    });

    it("takes the first value when the parameter is repeated", () => {
      expect(parseRankingParams({ page: ["4", "2"] }).page).toBe(4);
    });

    it("falls back to 1 when the first repeated value is invalid", () => {
      expect(parseRankingParams({ page: ["abc", "2"] }).page).toBe(1);
    });
  });

  it("reads all three together", () => {
    expect(parseRankingParams({ sort: "saved", dir: "asc", page: "2" })).toEqual({
      sort: "saved",
      dir: "asc",
      page: 2,
    });
  });
});

describe("rankingHref", () => {
  it("is the bare base URL when everything is a default", () => {
    expect(rankingHref("/rankings", {})).toBe("/rankings");
    expect(rankingHref("/rankings", DEFAULTS)).toBe("/rankings");
  });

  it("adds a non-default sort", () => {
    expect(parts(rankingHref("/rankings", { sort: "playbooks" }))).toEqual({
      path: "/rankings",
      query: { sort: "playbooks" },
    });
  });

  it("adds asc, and leaves out desc", () => {
    expect(parts(rankingHref("/rankings", { dir: "asc" })).query).toEqual({ dir: "asc" });
    expect(rankingHref("/rankings", { dir: "desc" })).toBe("/rankings");
  });

  it("adds a page above 1 and leaves out page 1", () => {
    expect(parts(rankingHref("/rankings", { page: 2 })).query).toEqual({ page: "2" });
    expect(rankingHref("/rankings", { page: 1 })).toBe("/rankings");
  });

  it("combines several non-default values", () => {
    expect(
      parts(rankingHref("/rankings/outbound", { sort: "saved", dir: "asc", page: 3 })),
    ).toEqual({
      path: "/rankings/outbound",
      query: { sort: "saved", dir: "asc", page: "3" },
    });
  });

  it("works on a subcategory base path", () => {
    expect(rankingHref("/rankings/outbound/cold-email", {})).toBe("/rankings/outbound/cold-email");
  });
});

describe("sortHref", () => {
  it("sorts another column descending on first click", () => {
    const current: RankingParams = { sort: "stacks", dir: "desc", page: 1 };
    // desc is the default, so it does not appear in the URL.
    expect(parts(sortHref("/rankings", current, "playbooks"))).toEqual({
      path: "/rankings",
      query: { sort: "playbooks" },
    });
  });

  it("sorts another column descending even when the current one was ascending", () => {
    const current: RankingParams = { sort: "stacks", dir: "asc", page: 1 };
    expect(parts(sortHref("/rankings", current, "saved")).query).toEqual({ sort: "saved" });
  });

  it("flips the active column from desc to asc", () => {
    const current: RankingParams = { sort: "stacks", dir: "desc", page: 1 };
    // stacks is the default sort, so only dir shows.
    expect(parts(sortHref("/rankings", current, "stacks")).query).toEqual({ dir: "asc" });
  });

  it("flips the active column from asc back to desc", () => {
    const current: RankingParams = { sort: "playbooks", dir: "asc", page: 1 };
    expect(parts(sortHref("/rankings", current, "playbooks")).query).toEqual({ sort: "playbooks" });
  });

  it("flips a non-default active column from desc to asc, keeping the sort", () => {
    const current: RankingParams = { sort: "saved", dir: "desc", page: 1 };
    expect(parts(sortHref("/rankings", current, "saved")).query).toEqual({
      sort: "saved",
      dir: "asc",
    });
  });

  it("returns to page 1 when switching column", () => {
    const current: RankingParams = { sort: "stacks", dir: "desc", page: 4 };
    expect(parts(sortHref("/rankings", current, "saved")).query).not.toHaveProperty("page");
  });

  it("returns to page 1 when flipping the active column", () => {
    const current: RankingParams = { sort: "stacks", dir: "desc", page: 4 };
    expect(parts(sortHref("/rankings", current, "stacks")).query).not.toHaveProperty("page");
  });

  it("keeps the base path", () => {
    const current: RankingParams = { sort: "stacks", dir: "desc", page: 1 };
    expect(parts(sortHref("/rankings/outbound/cold-email", current, "saved")).path).toBe(
      "/rankings/outbound/cold-email",
    );
  });
});

describe("canonicalPath", () => {
  it("is an absolute https://stackhub.me URL", () => {
    expect(canonicalPath("/rankings", DEFAULTS)).toBe("https://stackhub.me/rankings");
  });

  it("keeps the page when above 1", () => {
    expect(parts(canonicalPath("/rankings", { ...DEFAULTS, page: 3 }))).toEqual({
      path: "https://stackhub.me/rankings",
      query: { page: "3" },
    });
  });

  it("leaves page 1 out", () => {
    expect(canonicalPath("/rankings", { ...DEFAULTS, page: 1 })).toBe("https://stackhub.me/rankings");
  });

  // A sorted view is a re-ordering of the same content: it must not become its
  // own indexed URL.
  it("drops sort and dir", () => {
    expect(canonicalPath("/rankings", { sort: "saved", dir: "asc", page: 1 })).toBe(
      "https://stackhub.me/rankings",
    );
  });

  it("drops sort and dir but still keeps the page", () => {
    expect(parts(canonicalPath("/rankings/outbound", { sort: "saved", dir: "asc", page: 2 }))).toEqual({
      path: "https://stackhub.me/rankings/outbound",
      query: { page: "2" },
    });
  });
});
