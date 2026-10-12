import { describe, it, expect } from "vitest";
import { formSchema } from "@/app/new/form";

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tools = (n: number) => Array.from({ length: n }, (_, i) => uuid(i + 1));
const suggestions = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `Suggested ${i + 1}`,
    description: "A suggested tool",
    website: "https://example.com",
    categories: [1],
  }));

// A known-good playbook; each test overrides only the field it is about.
const base = {
  type: "playbook",
  name: "My post",
  tools: tools(1),
  description: "Fine",
};
const parse = (over: Record<string, unknown>) =>
  formSchema.safeParse({ ...base, ...over });

const messages = (r: ReturnType<typeof parse>) =>
  r.success ? [] : r.error.issues.map((i) => i.message);
const paths = (r: ReturnType<typeof parse>) =>
  r.success ? [] : r.error.issues.map((i) => i.path.join("."));

describe("formSchema type", () => {
  it("accepts playbook", () => {
    expect(parse({ type: "playbook" }).success).toBe(true);
  });

  it("accepts comparison", () => {
    expect(parse({ type: "comparison", tools: tools(2) }).success).toBe(true);
  });

  it("rejects combo — the post type was removed", () => {
    // Headline regression: combo must not come back as a valid type, even with
    // an otherwise perfect multi-tool payload.
    const r = parse({ type: "combo", tools: tools(3) });
    expect(r.success).toBe(false);
    expect(paths(r)).toContain("type");
  });

  it("rejects other strings, including the empty string", () => {
    expect(parse({ type: "guide" }).success).toBe(false);
    expect(parse({ type: "" }).success).toBe(false);
  });
});

describe("formSchema name", () => {
  it("rejects an empty name and a 1-character name", () => {
    expect(parse({ name: "" }).success).toBe(false);
    expect(parse({ name: "a" }).success).toBe(false);
  });

  it("accepts a 2-character name (boundary)", () => {
    expect(parse({ name: "ab" }).success).toBe(true);
  });

  it("prefixes the error with 'Playbook' for a playbook", () => {
    expect(messages(parse({ name: "a" }))).toContain(
      "Playbook name must be at least 2 characters."
    );
  });

  it("prefixes the error with 'Comparison' for a comparison", () => {
    const r = parse({ type: "comparison", tools: tools(2), name: "a" });
    expect(messages(r)).toContain(
      "Comparison name must be at least 2 characters."
    );
  });
});

describe("formSchema tool counts", () => {
  it("rejects a playbook with no tools", () => {
    const r = parse({ tools: [] });
    expect(r.success).toBe(false);
    expect(messages(r).join(" ")).toContain("A playbook requires at least 1 tool");
  });

  it("accepts a playbook with exactly 1 tool", () => {
    expect(parse({ tools: tools(1) }).success).toBe(true);
  });

  it("accepts a playbook with 2 tools — 2+ no longer means combo", () => {
    // Used to be rejected because several tools meant "combo". A playbook now
    // covers one or more tools; this guards against the old cap returning.
    expect(parse({ tools: tools(2) }).success).toBe(true);
  });

  it("accepts a playbook with 5 tools", () => {
    expect(parse({ tools: tools(5) }).success).toBe(true);
  });

  it("rejects a comparison with 0 tools, reporting the count", () => {
    const r = parse({ type: "comparison", tools: [] });
    expect(r.success).toBe(false);
    expect(messages(r).join(" ")).toContain(
      "A comparison requires at least 2 tools (you have 0)"
    );
  });

  it("rejects a comparison with 1 tool, reporting the count", () => {
    const r = parse({ type: "comparison", tools: tools(1) });
    expect(r.success).toBe(false);
    expect(messages(r).join(" ")).toContain(
      "A comparison requires at least 2 tools (you have 1)"
    );
  });

  it("accepts a comparison with 2 tools (boundary)", () => {
    expect(parse({ type: "comparison", tools: tools(2) }).success).toBe(true);
  });

  it("counts suggested tools: playbook with 0 tools and 1 suggestion is valid", () => {
    expect(
      parse({ tools: [], suggested_tools: suggestions(1) }).success
    ).toBe(true);
  });

  it("adds the two sources: comparison with 1 tool + 1 suggestion is valid", () => {
    expect(
      parse({
        type: "comparison",
        tools: tools(1),
        suggested_tools: suggestions(1),
      }).success
    ).toBe(true);
  });
});

describe("formSchema description", () => {
  it("accepts exactly 500 characters", () => {
    expect(parse({ description: "a".repeat(500) }).success).toBe(true);
  });

  it("rejects 501 characters", () => {
    const r = parse({ description: "a".repeat(501) });
    expect(r.success).toBe(false);
    expect(paths(r)).toContain("description");
  });
});

describe("formSchema experience_level", () => {
  it("is valid when omitted", () => {
    expect(parse({}).success).toBe(true);
  });

  it.each(["", "beginner", "intermediate", "advanced"])(
    "accepts %j",
    (level) => {
      expect(parse({ experience_level: level }).success).toBe(true);
    }
  );

  it("rejects an unknown level", () => {
    const r = parse({ experience_level: "expert" });
    expect(r.success).toBe(false);
    expect(paths(r)).toContain("experience_level");
  });
});

describe("formSchema multiple failures", () => {
  it("reports an issue for each user-reachable broken field, not just the first", () => {
    // Only states a person can produce in the form. experience_level is a
    // Select with fixed options, so an invalid value there is a code bug, not
    // user error, and is deliberately excluded.
    const r = parse({
      name: "a",
      description: "a".repeat(501),
      tools: [],
    });
    expect(r.success).toBe(false);
    const p = paths(r);
    expect(p).toContain("name");
    expect(p).toContain("description");
    expect(p).toContain("tools");
  });

  it("reports a bad name and a bad tool count together", () => {
    const r = parse({ type: "comparison", name: "a", tools: [] });
    expect(r.success).toBe(false);
    const msgs = messages(r).join(" | ");
    expect(msgs).toContain("Comparison name must be at least 2 characters.");
    expect(msgs).toContain("A comparison requires at least 2 tools");
  });
});
