import { describe, it, expect } from "vitest";
import { safeRedirectPath, safeExternalUrl } from "@/lib/safe-url";

/**
 * Both functions sit on a security boundary: safeRedirectPath decides where a
 * freshly signed-in user is sent (open-redirect), safeExternalUrl decides what
 * reaches window.open (javascript: URLs). The rejection lists are the point -
 * a happy path passing tells you almost nothing here.
 */

const ORIGIN = "https://stackhub.me";

describe("safeRedirectPath", () => {
  describe("same-site paths", () => {
    it("keeps the root", () => {
      expect(safeRedirectPath("/")).toBe("/");
    });

    it("keeps a simple path", () => {
      expect(safeRedirectPath("/settings")).toBe("/settings");
    });

    it("keeps a path with a query string and a fragment", () => {
      expect(safeRedirectPath("/max/my-post?tab=comments#c1")).toBe(
        "/max/my-post?tab=comments#c1",
      );
    });

    it("may resolve dot segments, but the result still means /a/c", () => {
      // A resolved path is acceptable; what matters is where it points.
      const result = safeRedirectPath("/a/b/../c");

      const resolved = new URL(result, ORIGIN);
      expect(resolved.origin).toBe(ORIGIN);
      expect(resolved.pathname).toBe("/a/c");
    });
  });

  describe("falls back to / for", () => {
    it.each([
      [null, "null"],
      [undefined, "undefined"],
      ["", "the empty string"],
    ])("%j (%s)", (input, label) => {
      expect(safeRedirectPath(input as string | null | undefined), label).toBe("/");
    });

    it.each([
      "settings", // no leading slash: would resolve relative to the callback route
      "https://evil.example",
      "http://evil.example/x",
      "//evil.example", // protocol-relative
      "/\\evil.example", // browsers treat /\ as //
      "javascript:alert(1)",
    ])("%j", (input) => {
      expect(safeRedirectPath(input)).toBe("/");
    });
  });

  describe("never produces a cross-origin redirect", () => {
    // The invariant is asserted for every input rather than an exact output,
    // because for the trickier ones either "/" or a harmless same-site path
    // is a correct answer. What must never happen is an off-site result.
    const hostile = [
      "https://evil.example",
      "http://evil.example/x",
      "//evil.example",
      "///evil.example",
      "////evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "\\/evil.example",
      "/\\/evil.example",
      "/%2F%2Fevil.example", // percent-encoded slashes are not a host
      "/%5Cevil.example",
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "https:evil.example",
      "https:/evil.example",
      // The URL parser strips tab / CR / LF, so each of these collapses to //evil.example.
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      "/\t\\evil.example",
      "\t//evil.example",
      "  //evil.example",
      " /\\evil.example",
      "/../../evil.example",
      "/..//evil.example",
      "/.//evil.example",
      "/a/..//evil.example",
      "settings",
      "",
      "/",
      "/settings",
      "/max/my-post?tab=comments#c1",
      "/a/b/../c",
    ];

    it.each(hostile)("for %j: stays on-site and starts with a single slash", (input) => {
      const result = safeRedirectPath(input);

      expect(result.startsWith("/")).toBe(true);
      expect(result.startsWith("//")).toBe(false);
      expect(result.startsWith("/\\")).toBe(false);
      expect(new URL(result, ORIGIN).origin).toBe(ORIGIN);
    });

    it("holds for null and undefined too", () => {
      for (const input of [null, undefined]) {
        const result = safeRedirectPath(input);
        expect(result.startsWith("/")).toBe(true);
        expect(result.startsWith("//")).toBe(false);
        expect(new URL(result, ORIGIN).origin).toBe(ORIGIN);
      }
    });
  });
});

describe("safeExternalUrl", () => {
  describe("accepts absolute http(s) URLs", () => {
    it.each([
      ["https://example.com", "https:", "example.com"],
      ["http://example.com/path?q=1", "http:", "example.com"],
      ["  https://example.com  ", "https:", "example.com"], // surrounding whitespace
      ["HTTPS://Example.com", "https:", "example.com"], // scheme is case-insensitive
      ["https://sub.example.co.uk:8443/a/b", "https:", "sub.example.co.uk"],
    ])("%j", (input, protocol, hostname) => {
      const result = safeExternalUrl(input);

      expect(result).not.toBeNull();
      // Asserting on the parsed result rather than string equality: the
      // function may normalise (trim, lowercase host), but must not change
      // where the link points.
      const parsed = new URL(result as string);
      expect(parsed.protocol).toBe(protocol);
      expect(parsed.hostname).toBe(hostname);
    });

    it("keeps the path and query of the link", () => {
      const parsed = new URL(safeExternalUrl("http://example.com/path?q=1") as string);

      expect(parsed.pathname).toBe("/path");
      expect(parsed.search).toBe("?q=1");
    });
  });

  describe("returns null for", () => {
    it.each([
      [null, "null"],
      [undefined, "undefined"],
      ["", "the empty string"],
      ["   ", "whitespace only"],
    ])("%j (%s)", (input, label) => {
      expect(safeExternalUrl(input as string | null | undefined), label).toBeNull();
    });

    it.each([
      "javascript:alert(1)",
      "JavaScript:alert(1)", // scheme match must be case-insensitive
      " javascript:alert(1)", // leading whitespace must not bypass the check
      "\tjavascript:alert(1)",
      "\njavascript:alert(1)",
      "javascript://example.com/%0Aalert(1)", // looks like a URL with a host
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "ftp://example.com",
      "file:///etc/passwd",
      "mailto:a@b.com",
      "blob:https://example.com/1234",
    ])("the non-http(s) scheme %j", (input) => {
      expect(safeExternalUrl(input)).toBeNull();
    });

    it.each([
      "example.com", // no scheme - relative, not absolute
      "www.example.com",
      "/relative/path",
      "//example.com", // protocol-relative is not absolute
      "not a url",
    ])("the non-absolute input %j", (input) => {
      expect(safeExternalUrl(input)).toBeNull();
    });
  });
});
