import { describe, it, expect } from "vitest";
import {
  shouldOfferToolSuggestion,
  shouldOfferPostCreation,
} from "@/lib/search-empty-state";

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

/**
 * The "Create a new post" prompt is the Posts-tab counterpart of the "Add a
 * tool" prompt: only on the Posts tab, and only when the search found nothing.
 */
describe("shouldOfferPostCreation", () => {
  it("offers the prompt on the posts tab when nothing was found", () => {
    expect(shouldOfferPostCreation("post", 0)).toBe(true);
  });

  describe("result count", () => {
    it("does NOT show the prompt beside a list that has results", () => {
      // The regression that matters: a "create a post" box sitting above real
      // rows. One result is the tightest boundary.
      expect(shouldOfferPostCreation("post", 1)).toBe(false);
    });

    it("does not show the prompt for a large result set", () => {
      expect(shouldOfferPostCreation("post", 50)).toBe(false);
    });

    it("treats a negative count as nothing found", () => {
      // Nonsense input, but failing towards "show the prompt" matches the
      // tool-suggestion behaviour for a count we cannot trust.
      expect(shouldOfferPostCreation("post", -1)).toBe(true);
    });
  });

  describe("category", () => {
    it("does not offer the prompt on the tools tab", () => {
      expect(shouldOfferPostCreation("tool", 0)).toBe(false);
    });

    it("does not offer the prompt on the users tab", () => {
      expect(shouldOfferPostCreation("profile", 0)).toBe(false);
    });

    it("does not offer the prompt for an unknown category", () => {
      expect(shouldOfferPostCreation("comparison", 0)).toBe(false);
    });

    it("does not offer the prompt when no tab is selected (empty string)", () => {
      expect(shouldOfferPostCreation("", 0)).toBe(false);
    });

    it("does not offer the prompt for a null category", () => {
      expect(shouldOfferPostCreation(null, 0)).toBe(false);
    });

    it("does not offer the prompt for an undefined category", () => {
      expect(shouldOfferPostCreation(undefined, 0)).toBe(false);
    });

    it("compares case-sensitively", () => {
      // The value comes from a URL parameter the app writes itself, so a
      // different casing is not a posts tab we recognise.
      expect(shouldOfferPostCreation("Post", 0)).toBe(false);
      expect(shouldOfferPostCreation("POST", 0)).toBe(false);
    });

    it("does not match the plural form or surrounding whitespace", () => {
      expect(shouldOfferPostCreation("posts", 0)).toBe(false);
      expect(shouldOfferPostCreation(" post", 0)).toBe(false);
      expect(shouldOfferPostCreation("post ", 0)).toBe(false);
    });
  });

  describe("independence from shouldOfferToolSuggestion", () => {
    const categories = ["post", "tool", "profile", "Post", "", null, undefined];
    const counts = [-1, 0, 1, 50];

    it("never offers both prompts for the same inputs", () => {
      // Both prompts at once would render two competing calls to action.
      for (const category of categories) {
        for (const count of counts) {
          const both =
            shouldOfferPostCreation(category, count) &&
            shouldOfferToolSuggestion(category, count);
          expect(both, `category=${String(category)} count=${count}`).toBe(false);
        }
      }
    });
  });
});
