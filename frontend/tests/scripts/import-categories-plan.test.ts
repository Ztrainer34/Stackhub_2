import { describe, expect, it } from "vitest";
import {
  fileProblems,
  planCategories,
  planHide,
  planRetire,
  planTools,
  slugify,
} from "../../scripts/import-categories-plan.mjs";

const structure = [
  { name: "RevOps", subcategories: ["CRM", "AI coding assistants"] },
  { name: "Creative", subcategories: ["Video"] },
];
const tool = (id: string, categories: string[], old: string[] = []) => ({
  id,
  name: id.toUpperCase(),
  categories,
  old_categories: old,
});
const row = (id: string, hidden_at: string | null = null, name = id.toUpperCase()) => ({ id, name, hidden_at });
const category = (id: number, name: string, slug = slugify(name)) => ({ id, name, slug });

describe("slugify", () => {
  it.each([
    ["A/B testing & CRO", "a-b-testing-cro"],
    ["HR & recruiting", "hr-recruiting"],
    [" CRM ", "crm"],
  ])("%s -> %s", (name, slug) => expect(slugify(name)).toBe(slug));
});

describe("fileProblems", () => {
  it("accepts a sound file", () => {
    expect(
      fileProblems({ structure, tools: [tool("a", ["CRM", "Video"])], redirects: { "AI CRM": "CRM", Mining: null } })
    ).toEqual([]);
  });

  it.each([
    ["no structure", { structure: [] }, "no structure"],
    ["an empty parent", { structure: [{ name: "X", subcategories: [] }] }, "no subcategories"],
    ["two categories on one page", { structure: [{ name: "Video", subcategories: ["video"] }] }, "/category/video"],
    ["more than 3", { structure, tools: [tool("a", ["CRM", "Video", "AI coding assistants", "CRM"])] }, "maximum 3"],
    ["a repeated category", { structure, tools: [tool("a", ["CRM", "CRM"])] }, "twice"],
    ["an unknown category", { structure, tools: [tool("a", ["Nope"])] }, '"Nope" is not a subcategory'],
    ["a parent used as a category", { structure, tools: [tool("a", ["RevOps"])] }, '"RevOps" is not a subcategory'],
    ["a repeated tool", { structure, tools: [tool("a", []), tool("a", [])] }, "in the file twice"],
    ["a bad redirect", { structure, redirects: { Old: "Nope" } }, 'redirect "Old"'],
    ["a tool both changed and left alone", { structure, tools: [tool("a", [])], leave_alone: [row("a")] }, "leave_alone"],
  ])("refuses %s", (_, file, message) => {
    expect(fileProblems(file).join("\n")).toContain(message);
  });
});

describe("planCategories", () => {
  it("reuses a category with the same name ignoring case, and creates the rest", () => {
    const { targets, problems } = planCategories({ structure }, [
      category(7, "AI Coding Assistants"),
      category(8, "CRM"),
      category(9, "Mining"),
    ]);
    expect(problems).toEqual([]);
    expect(targets.map((t) => [t.name, t.id, t.parent, t.sort_order])).toEqual([
      ["RevOps", null, null, 0],
      ["CRM", 8, "RevOps", 0],
      ["AI coding assistants", 7, "RevOps", 1],
      ["Creative", null, null, 1],
      ["Video", null, "Creative", 0],
    ]);
  });

  it("keeps the page address of a reused category", () => {
    const { targets } = planCategories({ structure }, [category(8, "CRM", "crm-old-address")]);
    expect(targets.find((t) => t.name === "CRM")).toMatchObject({ id: 8, slug: "crm-old-address" });
  });

  it("refuses a name that another row already has under another address", () => {
    const { problems } = planCategories({ structure }, [category(1, "Other", "crm"), category(2, "CRM", "crm-2")]);
    expect(problems.join()).toContain('"CRM" is also the name of category 2');
  });
});

describe("planRetire", () => {
  it("retires what is not in the structure, with its redirect", () => {
    const categories = [category(1, "CRM"), category(2, "AI BDR"), category(3, "Mining")];
    const file = { structure, redirects: { "ai bdr": "CRM", Mining: null } };
    const { targets } = planCategories(file, categories);
    expect(planRetire(file, categories, targets)).toEqual([
      { id: 2, name: "AI BDR", to: "CRM" },
      { id: 3, name: "Mining", to: null },
    ]);
  });
});

describe("planTools", () => {
  const categories = [category(1, "CRM"), category(2, "Video"), category(3, "Old One"), category(4, "Owner Pick")];
  const link = (tool_id: string, category_id: number, position = 0) => ({ tool_id, category_id, position });
  const run = (file: object, tools: object[], links: object[]) =>
    planTools({ structure, ...file }, tools as never, links as never, categories);
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  it("changes a tool untouched since the file was made", () => {
    const plan = run({ tools: [tool("a", ["CRM"], ["Old One"])] }, [row("a")], [link("a", 3)]);
    expect(ids(plan.change)).toEqual(["a"]);
  });

  it("leaves a tool edited since alone", () => {
    const plan = run({ tools: [tool("a", ["CRM"], ["Old One"])] }, [row("a")], [link("a", 3), link("a", 4)]);
    expect([ids(plan.change), ids(plan.edited)]).toEqual([[], ["a"]]);
  });

  it("is done when the order matches too, and corrects the order when it does not", () => {
    const file = { tools: [tool("a", ["Video", "CRM"], ["Old One"])] };
    expect(ids(run(file, [row("a")], [link("a", 1, 1), link("a", 2, 0)]).same)).toEqual(["a"]);
    expect(ids(run(file, [row("a")], [link("a", 1, 0), link("a", 2, 1)]).change)).toEqual(["a"]);
  });

  it("can correct a tool an earlier run imported", () => {
    const plan = run({ tools: [tool("a", ["CRM"], ["Old One"])] }, [row("a")], [link("a", 2)]);
    expect(ids(plan.change)).toEqual(["a"]);
  });

  it("finishes a tool that a stopped run left with old and new categories", () => {
    const plan = run({ tools: [tool("a", ["CRM"], ["Old One"])] }, [row("a")], [link("a", 1), link("a", 3)]);
    expect([ids(plan.change), ids(plan.edited)]).toEqual([["a"], []]);
  });

  it("clears a tool the file gives no category", () => {
    const plan = run({ tools: [tool("a", [], ["Old One"])] }, [row("a")], [link("a", 3)]);
    expect(plan.change[0].categories).toEqual([]);
  });

  it("never touches a hidden, renamed or unknown tool", () => {
    const plan = run(
      { tools: [tool("a", ["CRM"]), tool("b", ["CRM"]), tool("c", ["CRM"])] },
      [row("a", "2026-11-08"), row("b", null, "Something else")],
      []
    );
    expect([ids(plan.change), ids(plan.hidden), ids(plan.missing)]).toEqual([[], ["a"], ["b", "c"]]);
  });

  it("reports visible tools the file does not mention, except the ones it handles otherwise", () => {
    const plan = run(
      { tools: [tool("a", [])], leave_alone: [row("b")], hide: [row("c")] },
      [row("a"), row("b"), row("c"), row("d"), row("e", "2026-11-08")],
      []
    );
    expect(ids(plan.notInFile)).toEqual(["d"]);
  });
});

describe("planHide", () => {
  it("never hides a tool used in a post", () => {
    const file = { hide: [row("a"), row("b"), row("c"), row("d"), row("e")] };
    const tools = [row("a"), row("b"), row("c", "2026-11-08"), row("d", null, "Renamed")];
    const plan = planHide(file, tools, ["b", "zzz"]);
    const names = (rows: { id: string }[]) => rows.map((r) => r.id);
    expect([names(plan.hide), names(plan.inPosts), names(plan.already), names(plan.missing)]).toEqual([
      ["a"],
      ["b"],
      ["c"],
      ["d", "e"],
    ]);
  });
});
