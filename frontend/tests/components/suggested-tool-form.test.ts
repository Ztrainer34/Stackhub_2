import { describe, it, expect } from "vitest";
import { suggestedToolSchema } from "@/components/suggested-tool-form";

/**
 * Feature: the "Add tool" dialog now requires every field.
 *
 * Previously `website` and `description` were optional, and suggestions
 * arrived too incomplete for an admin to approve. The regression this file
 * guards against is either of those two quietly becoming optional again.
 */

const validInput = {
  name: "Clay",
  description: "A tool for enriching and syncing contact data.",
  website: "https://clay.com",
  categories: [1],
};

describe("suggestedToolSchema", () => {
  it("accepts a fully populated, valid object", () => {
    const result = suggestedToolSchema.safeParse(validInput);

    expect(result.success).toBe(true);
  });

  describe("name", () => {
    it("rejects an empty string", () => {
      const result = suggestedToolSchema.safeParse({ ...validInput, name: "" });

      expect(result.success).toBe(false);
    });

    it("accepts a name of exactly 100 characters", () => {
      const result = suggestedToolSchema.safeParse({
        ...validInput,
        name: "a".repeat(100),
      });

      expect(result.success).toBe(true);
    });

    it("rejects a name of 101 characters", () => {
      const result = suggestedToolSchema.safeParse({
        ...validInput,
        name: "a".repeat(101),
      });

      expect(result.success).toBe(false);
    });
  });

  describe("description", () => {
    // This is the change under test: description used to be optional.
    it("REQUIRES description — an empty string is invalid", () => {
      const result = suggestedToolSchema.safeParse({ ...validInput, description: "" });

      expect(result.success).toBe(false);
    });

    it("accepts a description of exactly 500 characters", () => {
      const result = suggestedToolSchema.safeParse({
        ...validInput,
        description: "a".repeat(500),
      });

      expect(result.success).toBe(true);
    });

    it("rejects a description of 501 characters", () => {
      const result = suggestedToolSchema.safeParse({
        ...validInput,
        description: "a".repeat(501),
      });

      expect(result.success).toBe(false);
    });
  });

  describe("website", () => {
    // This is the change under test: website used to accept "" explicitly.
    it("REQUIRES website — an empty string is invalid", () => {
      const result = suggestedToolSchema.safeParse({ ...validInput, website: "" });

      expect(result.success).toBe(false);
    });

    it("rejects a string that is not a URL", () => {
      const result = suggestedToolSchema.safeParse({ ...validInput, website: "not-a-url" });

      expect(result.success).toBe(false);
    });

    it("rejects a bare domain with no scheme", () => {
      const result = suggestedToolSchema.safeParse({ ...validInput, website: "example.com" });

      expect(result.success).toBe(false);
    });

    it("accepts a fully qualified URL", () => {
      const result = suggestedToolSchema.safeParse({
        ...validInput,
        website: "https://example.com",
      });

      expect(result.success).toBe(true);
    });
  });

  describe("categories", () => {
    it("rejects an empty array — at least one category is required", () => {
      const result = suggestedToolSchema.safeParse({ ...validInput, categories: [] });

      expect(result.success).toBe(false);
    });

    it("accepts a single category", () => {
      const result = suggestedToolSchema.safeParse({ ...validInput, categories: [3] });

      expect(result.success).toBe(true);
    });

    it("accepts multiple categories", () => {
      const result = suggestedToolSchema.safeParse({ ...validInput, categories: [1, 2, 3] });

      expect(result.success).toBe(true);
    });
  });

  describe("whole-object behaviour", () => {
    it("rejects an object missing a field entirely, not just left empty", () => {
      const { website, ...withoutWebsite } = validInput;
      void website;

      const result = suggestedToolSchema.safeParse(withoutWebsite);

      expect(result.success).toBe(false);
    });

    it("reports an issue for every invalid field, not just the first", () => {
      const result = suggestedToolSchema.safeParse({
        name: "",
        description: "",
        website: "not-a-url",
        categories: [],
      });

      expect(result.success).toBe(false);
      if (result.success) return;

      const failedPaths = result.error.issues.map((issue) => issue.path[0]);

      expect(failedPaths).toContain("name");
      expect(failedPaths).toContain("description");
      expect(failedPaths).toContain("website");
      expect(failedPaths).toContain("categories");
    });
  });
});
