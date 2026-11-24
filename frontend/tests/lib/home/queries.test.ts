import { describe, it, expect, vi } from "vitest";

// queries.ts imports server-side data fetching (the rankings queries pull in
// the Supabase server client, which needs next/headers). pickHomeCategories is
// pure, so those imports are replaced with empty stand-ins.
vi.mock("@/lib/rankings/queries", () => ({ getTopToolsByGroup: vi.fn() }));
vi.mock("@/lib/api", () => ({ fetchApi: vi.fn() }));

import { pickHomeCategories } from "@/lib/home/queries";
import type { TopToolsGroup } from "@/lib/rankings/types";

function group(slug: string, toolCount: number, name: string = slug): TopToolsGroup {
  return {
    name,
    slug,
    href: `/rankings/${slug}`,
    tools: Array.from({ length: toolCount }, (_, i) => ({
      rank: i + 1,
      id: `${slug}-${i}`,
      name: `${slug} ${i}`,
      logoUrl: null,
      stacks: 10 - i,
    })),
    note: null,
  };
}

describe("pickHomeCategories", () => {
  it("returns groups in the order of the slugs, not the order of the groups", () => {
    const groups = [group("a", 3), group("b", 3), group("c", 3)];
    expect(pickHomeCategories(groups, ["c", "a", "b"]).map((g) => g.slug)).toEqual(["c", "a", "b"]);
  });

  it("keeps a group with exactly 3 tools", () => {
    expect(pickHomeCategories([group("a", 3)], ["a"])).toHaveLength(1);
  });

  // The homepage block promises a top 3: a group with fewer would show a
  // half-empty card.
  it("drops groups with fewer than 3 tools", () => {
    const groups = [group("a", 2), group("b", 1), group("c", 0)];
    expect(pickHomeCategories(groups, ["a", "b", "c"])).toEqual([]);
  });

  it("drops groups with more than 3 tools (exactly 3 is the rule)", () => {
    expect(pickHomeCategories([group("a", 4)], ["a"])).toEqual([]);
  });

  it("skips slugs that match no group", () => {
    const groups = [group("a", 3), group("b", 3)];
    expect(pickHomeCategories(groups, ["a", "ghost", "b"]).map((g) => g.slug)).toEqual(["a", "b"]);
  });

  it("leaves out groups whose slug is not asked for", () => {
    const groups = [group("a", 3), group("b", 3)];
    expect(pickHomeCategories(groups, ["b"]).map((g) => g.slug)).toEqual(["b"]);
  });

  it("returns nothing for no slugs", () => {
    expect(pickHomeCategories([group("a", 3)], [])).toEqual([]);
  });

  it("returns nothing for no groups", () => {
    expect(pickHomeCategories([], ["a"])).toEqual([]);
  });

  // The configured list holds slugs. A display name is free text and can be
  // renamed without touching the slug.
  it("matches by slug when the display name is different", () => {
    const g = group("data-enrichment", 3, "Data & Enrichment");
    expect(pickHomeCategories([g], ["data-enrichment"])).toEqual([g]);
  });

  it("does not match a group whose NAME equals a wanted slug but whose slug does not", () => {
    const decoy = group("something-else", 3, "outbound");
    expect(pickHomeCategories([decoy], ["outbound"])).toEqual([]);
  });

  it("picks the group with the right slug when another group's name collides", () => {
    const decoy = group("something-else", 3, "outbound");
    const real = group("outbound", 3, "Outbound tools");
    expect(pickHomeCategories([decoy, real], ["outbound"])).toEqual([real]);
  });

  it("returns the group objects unchanged", () => {
    const g = group("a", 3);
    expect(pickHomeCategories([g], ["a"])[0]).toEqual(g);
  });
});
