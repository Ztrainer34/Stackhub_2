import { describe, expect, it } from "vitest";
import { categoryRedirect } from "@/lib/category";
import { filterCategories, groupCategories } from "@/lib/category-groups";
import type { TopCategory } from "@/lib/homepage";

const cat = (name: string, extra: Partial<TopCategory> = {}): TopCategory => ({
  id: name.length,
  name,
  slug: name.toLowerCase(),
  tool_count: 1,
  ...extra,
});
const under = (name: string, parent: string, parentOrder: number, order: number) =>
  cat(name, {
    parent_name: parent,
    parent_slug: parent.toLowerCase(),
    parent_sort_order: parentOrder,
    sort_order: order,
  });

describe("categoryRedirect", () => {
  it("stays on a current category", () => {
    expect(categoryRedirect(cat("CRM"))).toBeNull();
    expect(categoryRedirect(cat("CRM", { is_retired: false, replaced_by_slug: "x" }))).toBeNull();
  });

  it("sends a retired category to its replacement", () => {
    expect(categoryRedirect(cat("AI BDR", { is_retired: true, replaced_by_slug: "ai-sdrs" }))).toBe(
      "/category/ai-sdrs"
    );
  });

  it("sends a retired category with no replacement to /tools", () => {
    expect(categoryRedirect(cat("Mining", { is_retired: true, replaced_by_slug: "" }))).toBe("/tools");
  });
});

describe("groupCategories", () => {
  it("orders parents and subcategories by their set order, not by the order given", () => {
    const groups = groupCategories([
      under("Video", "Creative", 2, 0),
      under("CRM", "RevOps", 1, 1),
      under("Forecasting", "RevOps", 1, 0),
    ]);
    expect(groups.map((g) => [g.name, g.categories.map((c) => c.name)])).toEqual([
      ["RevOps", ["Forecasting", "CRM"]],
      ["Creative", ["Video"]],
    ]);
  });

  it("puts categories without a parent last, as given (the state before the import)", () => {
    const groups = groupCategories([cat("Zeta"), cat("Alpha"), under("CRM", "RevOps", 5, 0)]);
    expect(groups.map((g) => [g.name, g.categories.map((c) => c.name)])).toEqual([
      ["RevOps", ["CRM"]],
      ["", ["Zeta", "Alpha"]],
    ]);
  });

  it("handles no categories", () => {
    expect(groupCategories([])).toEqual([]);
  });
});

describe("filterCategories", () => {
  const all = [under("CRM", "RevOps", 0, 0), under("Video", "Creative", 1, 0)];

  it("matches a name or its parent, ignoring case and spaces", () => {
    expect(filterCategories(all, " crm ").map((c) => c.name)).toEqual(["CRM"]);
    expect(filterCategories(all, "creative").map((c) => c.name)).toEqual(["Video"]);
    expect(filterCategories(all, "nothing")).toEqual([]);
  });

  it("keeps everything when empty", () => {
    expect(filterCategories(all, "  ")).toEqual(all);
  });
});
