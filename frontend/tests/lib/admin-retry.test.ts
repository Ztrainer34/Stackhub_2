import { describe, expect, it } from "vitest";
import { retryAdminQuery } from "@/lib/admin-retry";

describe("retryAdminQuery", () => {
  it.each([
    "Failed to fetch tool tickets: 401 Unauthorized",
    "Failed to fetch tool tickets: 403 Forbidden",
    "Authentication required",
  ])("never retries %j", (message) => {
    for (const failureCount of [0, 1, 2, 3, 10]) {
      expect(retryAdminQuery(failureCount, new Error(message))).toBe(false);
    }
  });

  it("retries other failures up to three times", () => {
    const error = new Error("Failed to fetch tool tickets: 500 Internal Server Error");
    expect(retryAdminQuery(0, error)).toBe(true);
    expect(retryAdminQuery(1, error)).toBe(true);
    expect(retryAdminQuery(2, error)).toBe(true);
    expect(retryAdminQuery(3, error)).toBe(false);
  });

  it("matches the status as a whole number, not inside a longer one", () => {
    expect(retryAdminQuery(0, new Error("x4030"))).toBe(true);
    expect(retryAdminQuery(0, new Error("code 4010 happened"))).toBe(true);
  });
});
