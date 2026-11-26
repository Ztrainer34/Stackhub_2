import { describe, it, expect } from "vitest";
import { CHIP_TOOL_SLUGS, HOME_CATEGORY_SLUGS, HOME_ROUTES } from "@/lib/home/config";

// The order is the order on the page, so it is part of the contract.
describe("configured slug lists", () => {
  it("shows the chips in this exact order", () => {
    expect(CHIP_TOOL_SLUGS).toEqual([
      "clay",
      "claude-code",
      "n8n",
      "instantly",
      "hubspot",
      "heyreach",
      "trigify",
      "apollo-io",
    ]);
  });

  it("shows the homepage categories in this exact order", () => {
    expect(HOME_CATEGORY_SLUGS).toEqual([
      "outbound",
      "data-enrichment",
      "ai-automation",
      "signals-intent",
      "crm-revops",
      "marketing",
      "sales-enablement",
      "productivity",
    ]);
  });
});

describe("CHIP_TOOL_SLUGS", () => {
  // The tool's real slug is apollo-io. "apollo" matches nothing, so the chip
  // would silently vanish ("a slug that is missing is left out").
  it("uses apollo-io, not apollo", () => {
    expect(CHIP_TOOL_SLUGS).toContain("apollo-io");
    expect(CHIP_TOOL_SLUGS).not.toContain("apollo");
  });

  it("lists each slug once", () => {
    expect(new Set(CHIP_TOOL_SLUGS).size).toBe(CHIP_TOOL_SLUGS.length);
  });
});

describe("HOME_CATEGORY_SLUGS", () => {
  // Slugs are built from names, and "&" has become "-and-" in old category
  // slugs. The current parent categories use short slugs; an "-and-" slug means
  // an old or wrong slug that matches no ranking group, so the block drops out.
  it("contains no slug with -and-", () => {
    expect(HOME_CATEGORY_SLUGS.filter((s) => s.includes("-and-"))).toEqual([]);
  });

  it("lists each slug once", () => {
    expect(new Set(HOME_CATEGORY_SLUGS).size).toBe(HOME_CATEGORY_SLUGS.length);
  });
});

describe("HOME_ROUTES", () => {
  it("sends the logged-out Add to stack action to /login", () => {
    expect(HOME_ROUTES.addStack).toBe("/login");
  });
});
