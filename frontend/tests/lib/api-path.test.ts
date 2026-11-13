import { describe, it, expect } from "vitest";
import { apiPath } from "@/lib/api-path";

/**
 * apiPath builds backend request paths from user-controlled values (usernames,
 * slugs). Without encoding, a value like "../post/123/unpublish" turns a
 * request for one resource into a request for another - and the request carries
 * the caller's auth token. So every interpolation must stay inside its segment.
 */

describe("apiPath", () => {
  it("leaves a template with no interpolations unchanged", () => {
    expect(apiPath`/me`).toBe("/me");
  });

  it("substitutes plain values as written", () => {
    expect(apiPath`/user/${"max"}/posts/${"my-post"}`).toBe("/user/max/posts/my-post");
  });

  it("stringifies numbers", () => {
    expect(apiPath`/x?page=${2}`).toBe("/x?page=2");
  });

  it("stringifies zero rather than treating it as missing", () => {
    expect(apiPath`/x?page=${0}`).toBe("/x?page=0");
  });

  it("leaves the literal parts alone, including their own ? and /", () => {
    expect(apiPath`/search?t=${"post"}&q=${"a b"}`).toBe("/search?t=post&q=a%20b");
  });

  it("renders an empty-string value as nothing, without collapsing the slashes around it", () => {
    expect(apiPath`/user/${""}/posts`).toBe("/user//posts");
  });

  it("handles adjacent interpolations", () => {
    expect(apiPath`/${"a"}${"b"}`).toBe("/ab");
  });

  describe("a value cannot escape its segment", () => {
    it("encodes the slashes of a path-traversal value", () => {
      expect(apiPath`/user/${"../post/123/unpublish"}`).toBe(
        "/user/..%2Fpost%2F123%2Funpublish",
      );
    });

    it("never lets a raw / from a value reach the output", () => {
      const result = apiPath`/user/${"a/b/c"}`;

      // The only slash left is the literal one in the template.
      expect(result.slice("/user/".length)).not.toContain("/");
    });

    it("encodes a backslash", () => {
      expect(apiPath`/user/${"a\\b"}`).toBe("/user/a%5Cb");
    });
  });

  describe("a value cannot start a query string or fragment", () => {
    it("encodes ? = and #", () => {
      expect(apiPath`/user/${"a?b=c#d"}`).toBe("/user/a%3Fb%3Dc%23d");
    });

    it("encodes &", () => {
      expect(apiPath`/user/${"a&admin=1"}`).toBe("/user/a%26admin%3D1");
    });

    it("encodes spaces", () => {
      expect(apiPath`/user/${"a b"}`).toBe("/user/a%20b");
    });

    it("encodes % so an already-encoded value is not decoded later", () => {
      // "%2F" in a value must stay a literal "%2F" on the wire, not become "/".
      expect(apiPath`/user/${"%2F"}`).toBe("/user/%252F");
    });
  });

  it("encodes non-ASCII values as UTF-8 percent escapes", () => {
    expect(apiPath`/user/${"café"}`).toBe("/user/caf%C3%A9");
  });

  it("encodes every value, not just the first", () => {
    expect(apiPath`/a/${"x/y"}/b/${"p?q"}`).toBe("/a/x%2Fy/b/p%3Fq");
  });

  describe("dot-segment values", () => {
    // encodeURIComponent leaves "." and ".." untouched, and URL parsing (fetch,
    // new URL) resolves them: /user/../posts becomes /posts. Encoding alone
    // therefore does not keep a value inside its segment, so these must throw.
    // The percent-encoded spellings matter because the URL parser treats
    // %2e / %2E as "." too.
    it.each([".", "..", "%2e", "%2E", "%2e%2e", ".%2e", "%2E.", "%2E%2E"])(
      "throws when a value is %j",
      (value) => {
        expect(() => apiPath`/user/${value}/posts`).toThrow(Error);
      },
    );

    it("throws for a dot-segment value in the last position too", () => {
      expect(() => apiPath`/user/${".."}`).toThrow();
    });

    it("throws if any one of several values is a dot segment", () => {
      expect(() => apiPath`/user/${"max"}/posts/${".."}`).toThrow();
    });

    // Values that merely contain dots are legitimate usernames and slugs, and
    // refusing them would break real pages.
    it.each([
      ["...", "/x/..."],
      ["a..b", "/x/a..b"],
      [".hidden", "/x/.hidden"],
      ["jane.doe", "/x/jane.doe"],
      ["v1.2", "/x/v1.2"],
    ])("does not throw for %j, and leaves its dots as dots", (value, expected) => {
      expect(apiPath`/x/${value}`).toBe(expected);
    });

    it("does not throw when the dot segment is in the literal part", () => {
      // Literal parts are written by developers and are left as-is.
      expect(apiPath`/a/../b`).toBe("/a/../b");
    });
  });
});
