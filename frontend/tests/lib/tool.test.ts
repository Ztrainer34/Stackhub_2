import { describe, it, expect } from "vitest";
import { toolSlug, toolHref } from "@/lib/tool";

/**
 * toolSlug has to agree exactly with GetToolIDBySlug in backend/db/query.sql.
 * If the two ever drift, every tool link 404s — so these cases pin the shape of
 * the transformation, not just one happy example.
 */
describe("toolSlug", () => {
  it("lowercases", () => {
    expect(toolSlug("Clay")).toBe("clay");
  });

  it("collapses each run of non-alphanumerics into a single hyphen", () => {
    expect(toolSlug("Brevo Marketing Platform")).toBe("brevo-marketing-platform");
    expect(toolSlug("Google  Cloud   BigQuery")).toBe("google-cloud-bigquery");
  });

  it("treats punctuation as a separator, not as a character to keep", () => {
    expect(toolSlug("Serper.dev")).toBe("serper-dev");
    expect(toolSlug("X (Twitter)")).toBe("x-twitter");
    expect(toolSlug("Ocean.io")).toBe("ocean-io");
  });

  it("keeps digits", () => {
    expect(toolSlug("6sense")).toBe("6sense");
    expect(toolSlug("n8n")).toBe("n8n");
  });

  it("strips leading and trailing hyphens rather than leaving them", () => {
    expect(toolSlug("...Clay...")).toBe("clay");
    expect(toolSlug("  Clay  ")).toBe("clay");
  });

  it("returns an empty string when nothing survives", () => {
    expect(toolSlug("!!!")).toBe("");
    expect(toolSlug("")).toBe("");
  });
});

describe("toolHref", () => {
  it("builds a slug path", () => {
    expect(toolHref({ id: "uuid-1", name: "Clay" })).toBe("/tool/clay");
  });

  it("falls back to the id when the name yields no slug", () => {
    // A name of only punctuation would otherwise produce "/tool/", which
    // resolves to the tools index and silently loses the tool.
    expect(toolHref({ id: "uuid-1", name: "!!!" })).toBe("/tool/uuid-1");
  });
});
