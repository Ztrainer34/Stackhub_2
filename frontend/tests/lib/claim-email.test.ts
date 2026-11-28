import { describe, it, expect } from "vitest";
import { normaliseEmail, validateClaimEmails } from "@/lib/claim-email";

const ENTER = "Enter your email address.";
const INVALID = "Enter a valid email address.";
const CONFIRM = "Confirm your email address.";
const MISMATCH = "The two email addresses don't match.";

describe("normaliseEmail", () => {
  it("trims surrounding whitespace and lowercases", () => {
    expect(normaliseEmail("  You@Company.com  ")).toBe("you@company.com");
  });

  it("leaves an already-normalised address unchanged", () => {
    expect(normaliseEmail("already@lower.com")).toBe("already@lower.com");
  });

  it("returns an empty string for empty input", () => {
    expect(normaliseEmail("")).toBe("");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(normaliseEmail("   ")).toBe("");
  });
});

describe("validateClaimEmails", () => {
  describe("primary field", () => {
    it("asks for an address when the primary is empty", () => {
      expect(validateClaimEmails("", "you@company.com")).toBe(ENTER);
    });

    it("treats a whitespace-only primary as empty", () => {
      expect(validateClaimEmails("   ", "you@company.com")).toBe(ENTER);
    });

    it.each(["notanemail", "no@domain", "@company.com", "you@", "has space@company.com"])(
      "rejects %j as not email-shaped",
      (bad) => {
        expect(validateClaimEmails(bad, bad)).toBe(INVALID);
      },
    );

    it.each(["a@b.co", "first.last+tag@sub.domain.com"])("accepts %j", (good) => {
      expect(validateClaimEmails(good, good)).toBeNull();
    });
  });

  describe("confirmation field", () => {
    it("asks for confirmation when it is empty", () => {
      expect(validateClaimEmails("you@company.com", "")).toBe(CONFIRM);
    });

    it("treats a whitespace-only confirmation as empty", () => {
      expect(validateClaimEmails("you@company.com", "   ")).toBe(CONFIRM);
    });

    it("tells the user to fill the box in, NOT that the addresses mismatch, when confirmation is empty", () => {
      // An empty box differs from the primary, so a backwards check order
      // would report a mismatch to someone who simply has not typed yet.
      const result = validateClaimEmails("you@company.com", "");
      expect(result).not.toBe(MISMATCH);
      expect(result).toBe(CONFIRM);
    });
  });

  describe("matching", () => {
    it("does NOT let a mismatched pair through (a typo would mail a stranger a sign-in link)", () => {
      expect(validateClaimEmails("you@company.com", "you@comapny.com")).toBe(MISMATCH);
    });

    it("rejects completely different valid addresses", () => {
      expect(validateClaimEmails("you@company.com", "someone@else.org")).toBe(MISMATCH);
    });

    it("matches case-insensitively", () => {
      expect(validateClaimEmails("you@company.com", "YOU@COMPANY.COM")).toBeNull();
    });

    it("ignores surrounding whitespace on the primary", () => {
      expect(validateClaimEmails("  you@company.com  ", "you@company.com")).toBeNull();
    });

    it("ignores surrounding whitespace on the confirmation", () => {
      expect(validateClaimEmails("you@company.com", "  you@company.com  ")).toBeNull();
    });
  });

  describe("check order", () => {
    it("reports the primary message when both fields are empty", () => {
      expect(validateClaimEmails("", "")).toBe(ENTER);
    });

    it("reports an invalid primary before an empty confirmation", () => {
      expect(validateClaimEmails("notanemail", "")).toBe(INVALID);
    });

    it("reports an invalid primary before a mismatch", () => {
      expect(validateClaimEmails("notanemail", "other@company.com")).toBe(INVALID);
    });
  });
});
