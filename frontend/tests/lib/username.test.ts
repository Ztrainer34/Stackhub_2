import { describe, it, expect } from "vitest";
import { normalizeUsername, usernameProblem } from "@/lib/username";

/**
 * Mirrors the backend rule: after trimming and lowercasing, a username must
 * match ^[a-z0-9_-]{3,30}$. Usernames end up in URLs and in HTML attributes,
 * so the rejection list matters more than the accept list.
 */

const TOO_SHORT = "Username must be at least 3 characters long";
const TOO_LONG = "Username must be at most 30 characters long";
const BAD_CHARS =
  "Username can only contain lowercase letters, numbers, hyphens and underscores";

describe("normalizeUsername", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normalizeUsername("  Max ")).toBe("max");
  });

  it("leaves an already-normalised name unchanged", () => {
    expect(normalizeUsername("jane_doe")).toBe("jane_doe");
  });

  it("trims tabs and newlines, not only spaces", () => {
    expect(normalizeUsername("\tMax\n")).toBe("max");
  });

  it("does not remove whitespace inside the name", () => {
    // Stripping it would silently turn "jane doe" into a valid "janedoe".
    expect(normalizeUsername("Jane Doe")).toBe("jane doe");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normalizeUsername("   ")).toBe("");
  });

  it("is idempotent", () => {
    const once = normalizeUsername("  MaX_1 ");
    expect(normalizeUsername(once)).toBe(once);
  });
});

describe("usernameProblem", () => {
  describe("allows", () => {
    it.each([
      "max",
      "jane_doe",
      "growth-team",
      "user123",
      "123", // digits only
      "a_b",
      "---", // regex permits it; hyphens and underscores are plain characters
      "___",
    ])("%j", (name) => {
      expect(usernameProblem(name)).toBeNull();
    });

    it("uppercase, because it is normalised first", () => {
      expect(usernameProblem("MAX")).toBeNull();
    });

    it("surrounding whitespace", () => {
      expect(usernameProblem("  max  ")).toBeNull();
      expect(usernameProblem("\tmax\n")).toBeNull();
    });

    it("exactly 30 characters (upper boundary)", () => {
      expect(usernameProblem("a".repeat(30))).toBeNull();
    });

    it("exactly 3 characters (lower boundary)", () => {
      expect(usernameProblem("abc")).toBeNull();
    });

    it("30 characters of content padded with whitespace, since length is counted after normalising", () => {
      expect(usernameProblem(`  ${"a".repeat(30)}  `)).toBeNull();
    });
  });

  describe("too short", () => {
    it.each(["", "a", "ab"])("%j", (name) => {
      expect(usernameProblem(name)).toBe(TOO_SHORT);
    });

    it("counts length after trimming: '  ab  ' is 2 characters, not 6", () => {
      expect(usernameProblem("  ab  ")).toBe(TOO_SHORT);
    });

    it("treats whitespace-only input as empty", () => {
      expect(usernameProblem("     ")).toBe(TOO_SHORT);
    });
  });

  describe("too long", () => {
    it("rejects 31 characters (just over the boundary)", () => {
      expect(usernameProblem("a".repeat(31))).toBe(TOO_LONG);
    });

    it("rejects a much longer name", () => {
      expect(usernameProblem("a".repeat(500))).toBe(TOO_LONG);
    });

    it("counts length after lowercasing and trimming, still too long when padded", () => {
      expect(usernameProblem(` ${"A".repeat(31)} `)).toBe(TOO_LONG);
    });
  });

  describe("bad characters", () => {
    it.each([
      ["jane.doe", "a dot"],
      ["jane doe", "an inner space"],
      ["<script>", "angle brackets"],
      ['x" style="display:none', "an attribute-breaking quote"],
      ["../post", "path traversal"],
      ["a/b/c", "slashes"],
      ["a\\b\\c", "backslashes"],
      ["emoji😀", "an emoji"],
      ["tab\tname", "an inner tab"],
      ["new\nline", "an inner newline"],
      ["café", "a non-ASCII letter"],
      ["jane@doe", "an at sign"],
      ["a?b=c#d", "URL metacharacters"],
      ["%2e%2e", "percent escapes"],
      ["null\0byte", "a NUL byte"],
    ])("%j (%s)", (name) => {
      expect(usernameProblem(name)).toBe(BAD_CHARS);
    });

    it("does not let an inner space through just because the edges are trimmed", () => {
      expect(usernameProblem("  jane doe  ")).toBe(BAD_CHARS);
    });
  });
});
