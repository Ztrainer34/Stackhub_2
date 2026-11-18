import { describe, it, expect } from "vitest";
import {
  MAX_POST_TOOLS,
  MAX_GOAL_LENGTH,
  MIN_TITLE_LENGTH,
  realTools,
  minToolsFor,
  toolCountHint,
  validatePostDetails,
  toolsChanged,
  buildToolsUpdate,
} from "@/lib/post-details";
import type { PostTool } from "@/lib/post";

const tool = (id: string, is_ticket = false): PostTool => ({
  id,
  name: `Tool ${id}`,
  logo_url: "",
  is_ticket,
});

const suggestion = (name: string) => ({
  name,
  description: "d",
  website: "https://example.com",
  categories: [1, 2],
});

type Input = Parameters<typeof validatePostDetails>[0];
const ok = (over: Partial<Input> = {}): Input => ({
  type: "playbook",
  title: "A fine title",
  goal: "A goal",
  originalGoal: "A goal",
  toolCount: 3,
  ...over,
});

describe("constants", () => {
  it("pin the limits the backend enforces", () => {
    expect(MAX_POST_TOOLS).toBe(10);
    expect(MAX_GOAL_LENGTH).toBe(500);
    expect(MIN_TITLE_LENGTH).toBe(2);
  });
});

describe("realTools", () => {
  it("drops the all-null placeholder the view returns for a post with no tools", () => {
    const placeholder = { id: null, name: null, logo_url: null, is_ticket: null };
    expect(realTools([placeholder as unknown as PostTool])).toEqual([]);
  });

  it("keeps entries that have an id", () => {
    const a = tool("a");
    const b = tool("b", true);
    expect(realTools([a, b])).toEqual([a, b]);
  });

  it("returns [] for null and undefined", () => {
    expect(realTools(null)).toEqual([]);
    expect(realTools(undefined)).toEqual([]);
  });

  it("does not throw on a null element, and drops it", () => {
    const a = tool("a");
    expect(realTools([null as unknown as PostTool, a])).toEqual([a]);
  });
});

describe("minToolsFor", () => {
  it("is 1 for a playbook", () => {
    expect(minToolsFor("playbook")).toBe(1);
  });

  it("is 2 for a comparison", () => {
    expect(minToolsFor("comparison")).toBe(2);
  });
});

describe("toolCountHint", () => {
  it("names the minimum and maximum for a playbook", () => {
    expect(toolCountHint("playbook")).toBe("At least 1, up to 10");
  });

  it("names the minimum and maximum for a comparison", () => {
    expect(toolCountHint("comparison")).toBe("At least 2, up to 10");
  });
});

describe("validatePostDetails: happy path", () => {
  it("returns an empty array when everything is fine", () => {
    expect(validatePostDetails(ok())).toEqual([]);
  });
});

describe("validatePostDetails: title", () => {
  it("rejects an empty title", () => {
    expect(validatePostDetails(ok({ title: "" }))).toHaveLength(1);
  });

  it("treats a whitespace-only title as empty", () => {
    expect(validatePostDetails(ok({ title: "     " }))).toHaveLength(1);
  });

  it("measures the title after trimming", () => {
    // "  a  " is 5 characters raw but 1 real one; counting raw length would let it through.
    expect(validatePostDetails(ok({ title: "  a  " }))).toHaveLength(1);
  });

  it("rejects a 1-character title", () => {
    expect(validatePostDetails(ok({ title: "a" }))).toHaveLength(1);
  });

  it("accepts a title of exactly 2 characters", () => {
    expect(validatePostDetails(ok({ title: "ab" }))).toEqual([]);
  });

  it("accepts a 2-character title padded with whitespace", () => {
    expect(validatePostDetails(ok({ title: "  ab  " }))).toEqual([]);
  });
});

describe("validatePostDetails: goal", () => {
  const long = (n: number) => "x".repeat(n);

  it("accepts a goal of exactly 500", () => {
    const g = long(500);
    expect(validatePostDetails(ok({ goal: g, originalGoal: "" }))).toEqual([]);
  });

  it("rejects a changed goal of 501", () => {
    const g = long(501);
    expect(validatePostDetails(ok({ goal: g, originalGoal: "" }))).toHaveLength(1);
  });

  it("does NOT block an unrelated edit when the over-long goal is unchanged", () => {
    // An imported post can arrive with a goal over the limit; the author fixing
    // the title must not be forced to trim a goal they never touched.
    const g = long(800);
    expect(validatePostDetails(ok({ goal: g, originalGoal: g }))).toEqual([]);
  });

  it("rejects an over-long goal that differs from the original, even if the original was also long", () => {
    expect(
      validatePostDetails(ok({ goal: long(801), originalGoal: long(800) })),
    ).toHaveLength(1);
  });

  it("accepts an empty goal because the goal is optional", () => {
    expect(validatePostDetails(ok({ goal: "", originalGoal: "something" }))).toEqual([]);
  });
});

describe("validatePostDetails: tool count", () => {
  it("rejects 0 tools for a playbook", () => {
    expect(validatePostDetails(ok({ toolCount: 0 }))).toHaveLength(1);
  });

  it("accepts 1 tool for a playbook", () => {
    expect(validatePostDetails(ok({ toolCount: 1 }))).toEqual([]);
  });

  it("rejects 0 tools for a comparison", () => {
    expect(validatePostDetails(ok({ type: "comparison", toolCount: 0 }))).toHaveLength(1);
  });

  it("rejects 1 tool for a comparison", () => {
    expect(validatePostDetails(ok({ type: "comparison", toolCount: 1 }))).toHaveLength(1);
  });

  it("accepts 2 tools for a comparison", () => {
    expect(validatePostDetails(ok({ type: "comparison", toolCount: 2 }))).toEqual([]);
  });

  it("accepts exactly 10 tools", () => {
    expect(validatePostDetails(ok({ toolCount: 10 }))).toEqual([]);
  });

  it("rejects 11 tools", () => {
    expect(validatePostDetails(ok({ toolCount: 11 }))).toHaveLength(1);
  });
});

describe("validatePostDetails: messages", () => {
  it("uses singular 'tool' and names the playbook when its minimum is 1", () => {
    const [msg] = validatePostDetails(ok({ toolCount: 0 }));
    expect(msg).toMatch(/\b1 tool\b/);
    expect(msg).not.toMatch(/\b1 tools\b/);
    expect(msg.toLowerCase()).toContain("playbook");
  });

  it("uses plural 'tools' and names the comparison when its minimum is 2", () => {
    const [msg] = validatePostDetails(ok({ type: "comparison", toolCount: 1 }));
    expect(msg).toMatch(/\b2 tools\b/);
    expect(msg.toLowerCase()).toContain("comparison");
  });

  it("names the post type in the too-many-tools message", () => {
    const [msg] = validatePostDetails(ok({ type: "comparison", toolCount: 11 }));
    expect(msg.toLowerCase()).toContain("comparison");
  });
});

describe("validatePostDetails: reports everything at once", () => {
  it("returns one message per problem, not just the first", () => {
    // Stopping at the first problem makes the author fix, save, and fail again, three times.
    const msgs = validatePostDetails({
      type: "comparison",
      title: " ",
      goal: "x".repeat(501),
      originalGoal: "",
      toolCount: 0,
    });
    expect(msgs).toHaveLength(3);
  });

  it("returns distinct messages", () => {
    const msgs = validatePostDetails({
      type: "playbook",
      title: "",
      goal: "x".repeat(501),
      originalGoal: "",
      toolCount: 0,
    });
    expect(new Set(msgs).size).toBe(msgs.length);
  });
});

describe("toolsChanged", () => {
  it("is false when both lists are empty and there are no suggestions", () => {
    expect(toolsChanged([], [], [])).toBe(false);
  });

  it("is false when the lists are identical", () => {
    expect(toolsChanged([tool("a"), tool("b")], [tool("a"), tool("b")], [])).toBe(false);
  });

  it("is false when the same ids are in another order", () => {
    // Reordering alone is not a change the backend cares about; reporting it would enable a pointless save.
    expect(toolsChanged([tool("a"), tool("b")], [tool("b"), tool("a")], [])).toBe(false);
  });

  it("is true when a suggestion exists, even if the lists match", () => {
    expect(toolsChanged([tool("a")], [tool("a")], [suggestion("New")])).toBe(true);
  });

  it("is true when the lengths differ (tool added)", () => {
    expect(toolsChanged([tool("a")], [tool("a"), tool("b")], [])).toBe(true);
  });

  it("is true when the lengths differ (tool removed)", () => {
    expect(toolsChanged([tool("a"), tool("b")], [tool("a")], [])).toBe(true);
  });

  it("is true when same length but a different id (swap)", () => {
    expect(toolsChanged([tool("a"), tool("b")], [tool("a"), tool("c")], [])).toBe(true);
  });

  it("is true when saved is empty and current has a tool", () => {
    expect(toolsChanged([], [tool("a")], [])).toBe(true);
  });
});

describe("buildToolsUpdate", () => {
  it("returns three empty arrays for empty input", () => {
    expect(buildToolsUpdate([], [])).toEqual({
      tools: [],
      ticket_ids: [],
      suggested_tools: [],
    });
  });

  it("puts real tool ids in tools and ticket ids in ticket_ids", () => {
    const body = buildToolsUpdate(
      [tool("t1"), tool("k1", true), tool("t2"), tool("k2", true)],
      [],
    );
    expect(body.tools).toEqual(["t1", "t2"]);
    expect(body.ticket_ids).toEqual(["k1", "k2"]);
  });

  it("never lists a ticket id under tools", () => {
    // A ticket id sent as a tool id would be looked up in the tools table and rejected or mislinked.
    const body = buildToolsUpdate([tool("k1", true)], []);
    expect(body.tools).toEqual([]);
  });

  it("sends only name, description, website and categories for a suggestion", () => {
    // The UI tags suggestions with a temporary id / type; leaking them to the API is silent noise at best.
    const withExtras = {
      ...suggestion("New"),
      id: "temp-123",
      type: "suggested",
    };
    const body = buildToolsUpdate([], [withExtras]);
    expect(body.suggested_tools).toEqual([
      {
        name: "New",
        description: "d",
        website: "https://example.com",
        categories: [1, 2],
      },
    ]);
  });
});
