import { describe, it, expect } from "vitest";
import { plainTextToTiptap } from "@/lib/tiptap-tool-page";

/**
 * Feature: tool page ownership (Sept 2026).
 *
 * When an owner opens the About editor on a tool whose description was scraped
 * as plain text, that text has to become a Tiptap document without losing its
 * paragraph breaks. Getting this wrong silently flattens every scraped
 * description the first time somebody edits it.
 */
describe("plainTextToTiptap", () => {
  it("wraps a single line in one paragraph", () => {
    expect(plainTextToTiptap("Hello")).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }],
    });
  });

  it("splits on blank lines, one paragraph each", () => {
    const doc = plainTextToTiptap("First para.\n\nSecond para.");

    expect(doc.content).toHaveLength(2);
    expect(doc.content[0].content?.[0].text).toBe("First para.");
    expect(doc.content[1].content?.[0].text).toBe("Second para.");
  });

  it("does NOT split on a single newline", () => {
    // A lone newline is a soft wrap inside one paragraph. Splitting here would
    // shred every scraped description into one-line fragments.
    const doc = plainTextToTiptap("Line one\nline two");

    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].content?.[0].text).toBe("Line one\nline two");
  });

  it("treats three or more newlines as one break, not several", () => {
    expect(plainTextToTiptap("A\n\n\n\nB").content).toHaveLength(2);
  });

  it("trims each paragraph", () => {
    const doc = plainTextToTiptap("   padded   \n\n   also padded   ");

    expect(doc.content[0].content?.[0].text).toBe("padded");
    expect(doc.content[1].content?.[0].text).toBe("also padded");
  });

  it("returns one empty paragraph for empty input, never zero", () => {
    // Tiptap refuses to mount on a doc with no content, so the editor would
    // fail to open on a tool that has no description yet.
    const doc = plainTextToTiptap("");

    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]).toEqual({ type: "paragraph", content: [] });
  });

  it("returns one empty paragraph for whitespace-only input", () => {
    expect(plainTextToTiptap("   \n\n   ").content).toHaveLength(1);
  });
});
