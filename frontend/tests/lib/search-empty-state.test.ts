import { describe, it, expect } from "vitest";
import { shouldOfferToolSuggestion } from "@/lib/search-empty-state";

/**
 * The "Add a tool" prompt is only meaningful on the Tools tab, and only when
 * the search found nothing. Both halves are pinned separately below.
 */
describe("shouldOfferToolSuggestion", () => {
  it("offers the prompt on the tool tab when nothing was found", () => {
    expect(shouldOfferToolSuggestion("tool", 0)).toBe(true);
  });

  describe("result count", () => {
    it("does NOT show the prompt beside a list that has results", () => {
      // The regression that matters: a "can't find it?" box sitting above
      // real rows. One result is the tightest boundary.
      expect(shouldOfferToolSuggestion("tool", 1)).toBe(false);
    });

    it("does not show the prompt for a large result set", () => {
      expect(shouldOfferToolSuggestion("tool", 50)).toBe(false);
    });

    it("treats a negative count as nothing found", () => {
      // Nonsense input, but failing towards "show the prompt" is safer than
      // the opposite for a count we cannot trust.
      expect(shouldOfferToolSuggestion("tool", -1)).toBe(true);
    });
  });

  describe("category", () => {
    // Users and posts cannot be added by a visitor, so suggesting it is wrong.
    it("does not offer the prompt on the posts tab", () => {
      expect(shouldOfferToolSuggestion("post", 0)).toBe(false);
    });

    it("does not offer the prompt on the users tab", () => {
      expect(shouldOfferToolSuggestion("profile", 0)).toBe(false);
    });

    it("does not offer the prompt when no tab is selected (empty string)", () => {
      expect(shouldOfferToolSuggestion("", 0)).toBe(false);
    });

    it("does not offer the prompt for a null category", () => {
      expect(shouldOfferToolSuggestion(null, 0)).toBe(false);
    });

    it("does not offer the prompt for an undefined category", () => {
      expect(shouldOfferToolSuggestion(undefined, 0)).toBe(false);
    });

    it("compares case-sensitively", () => {
      // The value comes from a URL parameter the app writes itself, so a
      // different casing is not a tool tab we recognise.
      expect(shouldOfferToolSuggestion("Tool", 0)).toBe(false);
      expect(shouldOfferToolSuggestion("TOOL", 0)).toBe(false);
    });

    it("does not match the plural form", () => {
      expect(shouldOfferToolSuggestion("tools", 0)).toBe(false);
    });
  });
});
