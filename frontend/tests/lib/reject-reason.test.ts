import { describe, expect, it } from "vitest";
import {
  REJECT_REASON_MAX,
  REJECT_REASON_MIN,
  cleanRejectReason,
  rejectReasonLength,
  rejectReasonProblem,
} from "@/lib/reject-reason";

describe("rejectReasonProblem", () => {
  it("requires a reason", () => {
    expect(rejectReasonProblem("")).toBe("A reason is required");
    expect(rejectReasonProblem("   \n\t  ")).toBe("A reason is required");
    expect(rejectReasonProblem("​‮ ")).toBe("A reason is required");
  });

  it("refuses fewer than 10 characters", () => {
    expect(REJECT_REASON_MIN).toBe(10);
    expect(rejectReasonProblem("123456789")).toBe("Reason must be at least 10 characters");
    expect(rejectReasonProblem("   123456789   ")).toBe("Reason must be at least 10 characters");
  });

  it("accepts exactly 10 characters", () => {
    expect(rejectReasonProblem("1234567890")).toBeNull();
    expect(rejectReasonProblem("  1234567890  ")).toBeNull();
  });

  it("accepts exactly 500 characters and refuses 501", () => {
    expect(REJECT_REASON_MAX).toBe(500);
    expect(rejectReasonProblem("a".repeat(500))).toBeNull();
    expect(rejectReasonProblem("a".repeat(501))).toBe("Reason must be at most 500 characters");
  });

  it("counts an emoji as one character, not two", () => {
    expect(rejectReasonProblem("🚫".repeat(9))).toBe("Reason must be at least 10 characters");
    expect(rejectReasonProblem("🚫".repeat(10))).toBeNull();
    expect(rejectReasonProblem("🚫".repeat(500))).toBeNull();
    expect(rejectReasonProblem("🚫".repeat(501))).toBe("Reason must be at most 500 characters");
    expect(rejectReasonLength("🚫".repeat(3))).toBe(3);
  });

  it("does not count invisible characters toward the minimum", () => {
    expect(rejectReasonProblem("123456789​")).toBe("Reason must be at least 10 characters");
    expect(rejectReasonProblem("12345‮6789")).toBeNull(); // the override becomes a space: 10
  });
});

describe("cleanRejectReason", () => {
  // Control characters that \s does not match (NUL, BEL, ESC, DEL) must be
  // cleaned too, or the frontend would accept a reason the backend refuses.
  it("turns control characters outside \\s into spaces", () => {
    expect(cleanRejectReason("a\u0000b\u0007c\u001bd\u007fe")).toBe("a b c d e");
    expect(rejectReasonProblem("123456789\u0000")).toBe(
      "Reason must be at least 10 characters"
    );
  });

  it("collapses whitespace and invisible characters like the backend", () => {
    expect(cleanRejectReason("  Too similar\r\nto\tAirtable ")).toBe("Too similar to Airtable");
    expect(cleanRejectReason("a⁦b​c d")).toBe("a b c d");
  });
});
