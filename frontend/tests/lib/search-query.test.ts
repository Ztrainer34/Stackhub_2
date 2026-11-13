import { describe, it, expect } from "vitest";
import { parseSearchQuery, matchesSearchQuery, makeSearchMatcher } from "@/lib/search-query";

/**
 * Small search language for the client-side tool filters. It is OR-only: there
 * is no AND, no negation, no phrase matching. Anything matching ANY term is
 * shown, so typing more terms always WIDENS the result set - the exact
 * opposite of the older AND/OR/NOT grammar this module used to implement. It
 * also runs on every keystroke against a half-typed query, so a trailing "|"
 * or a lone "," must parse into something sensible and never throw.
 */

describe("parseSearchQuery", () => {
  it("parses a single word into a one-term query", () => {
    expect(parseSearchQuery("adobe")).toEqual(["adobe"]);
  });

  it("lowercases terms", () => {
    expect(parseSearchQuery("Adobe")).toEqual(["adobe"]);
  });

  it("splits on |, comma and whitespace identically", () => {
    const expected = ["adobe", "content"];
    expect(parseSearchQuery("adobe|content")).toEqual(expected);
    expect(parseSearchQuery("adobe content")).toEqual(expected);
    expect(parseSearchQuery("adobe, content")).toEqual(expected);
    expect(parseSearchQuery("adobe,content")).toEqual(expected);
  });

  it("matches the product-spec example of three OR'd terms", () => {
    expect(parseSearchQuery("adobe|content|a")).toEqual(["adobe", "content", "a"]);
  });

  it("drops duplicate terms", () => {
    expect(parseSearchQuery("adobe adobe|adobe")).toEqual(["adobe"]);
  });

  it("never emits empty terms for runs of separators", () => {
    expect(parseSearchQuery("adobe||content")).toEqual(["adobe", "content"]);
    expect(parseSearchQuery("adobe ,  content")).toEqual(["adobe", "content"]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseSearchQuery("")).toEqual([]);
  });

  it("returns an empty array for whitespace-only input", () => {
    expect(parseSearchQuery("   ")).toEqual([]);
  });

  it("returns an empty array for separator-only input", () => {
    expect(parseSearchQuery("|")).toEqual([]);
    expect(parseSearchQuery(",")).toEqual([]);
    expect(parseSearchQuery("|||")).toEqual([]);
  });

  it("strips double quotes wherever they appear, with no phrase meaning", () => {
    // A quoted "phrase" is not a unit here - it parses exactly as if the
    // quotes were never typed.
    expect(parseSearchQuery('"adobe cloud"')).toEqual(["adobe", "cloud"]);
    expect(parseSearchQuery('"adobe" "cloud"')).toEqual(["adobe", "cloud"]);
  });

  it("strips a leading - or ! from a term", () => {
    expect(parseSearchQuery("-cloud")).toEqual(["cloud"]);
    expect(parseSearchQuery("!cloud")).toEqual(["cloud"]);
  });

  it("keeps a hyphen that is inside a word, since tool names contain them", () => {
    expect(parseSearchQuery("t-mobile")).toEqual(["t-mobile"]);
  });

  it("drops a term that is only leading -/!/quotes, leaving nothing behind", () => {
    expect(parseSearchQuery("-")).toEqual([]);
    expect(parseSearchQuery("!")).toEqual([]);
    expect(parseSearchQuery('""')).toEqual([]);
    expect(parseSearchQuery('adobe -')).toEqual(["adobe"]);
  });

  it("parses half-typed input without throwing, dropping the trailing separator", () => {
    // These are exactly the strings a text box holds mid-keystroke.
    expect(() => parseSearchQuery("adobe|")).not.toThrow();
    expect(parseSearchQuery("adobe|")).toEqual(["adobe"]);

    expect(() => parseSearchQuery("adobe,")).not.toThrow();
    expect(parseSearchQuery("adobe,")).toEqual(["adobe"]);

    expect(() => parseSearchQuery("adobe |")).not.toThrow();
    expect(parseSearchQuery("adobe |")).toEqual(["adobe"]);

    expect(() => parseSearchQuery("|")).not.toThrow();
    expect(parseSearchQuery("|")).toEqual([]);

    expect(() => parseSearchQuery(",")).not.toThrow();
    expect(parseSearchQuery(",")).toEqual([]);
  });
});

describe("matchesSearchQuery", () => {
  it("matches everything when the query is empty", () => {
    // A blank search box must filter nothing out.
    expect(matchesSearchQuery([], ["Adobe", "Content"])).toBe(true);
    expect(matchesSearchQuery([], [])).toBe(true);
    expect(matchesSearchQuery([], [null, undefined])).toBe(true);
  });

  it("matches when at least one term is found as a substring", () => {
    expect(matchesSearchQuery(["adobe"], ["Adobe Express"])).toBe(true);
  });

  it("does not match when no term is found", () => {
    expect(matchesSearchQuery(["notion"], ["Adobe Express"])).toBe(false);
  });

  it("adding a second term widens matches rather than narrowing them", () => {
    // This is the core OR-only property: a field that only satisfies the
    // SECOND term must still match once that term is added to the query.
    // Under the old AND semantics this would have failed.
    const oneTerm = ["adobe"];
    const twoTerms = ["adobe", "notion"];

    expect(matchesSearchQuery(oneTerm, ["Notion"])).toBe(false);
    expect(matchesSearchQuery(twoTerms, ["Notion"])).toBe(true);
  });

  it("matches fields joined together, not field-by-field", () => {
    // "content" is in neither field alone but is in the join of the two.
    const query = parseSearchQuery("content");
    expect(matchesSearchQuery(query, ["Adobe", "cloud tooling"])).toBe(false);
    expect(matchesSearchQuery(query, ["Adobe", "content tooling"])).toBe(true);
  });

  it("ignores null and undefined entries in fields without throwing", () => {
    const query = parseSearchQuery("adobe");
    expect(() => matchesSearchQuery(query, [null, undefined])).not.toThrow();
    expect(matchesSearchQuery(query, [null, "Adobe", undefined])).toBe(true);
    expect(matchesSearchQuery(query, [null, undefined])).toBe(false);
  });

  it("is case-insensitive regardless of which side has the different case", () => {
    expect(matchesSearchQuery(parseSearchQuery("ADOBE"), ["adobe express"])).toBe(true);
    expect(matchesSearchQuery(parseSearchQuery("adobe"), ["ADOBE EXPRESS"])).toBe(true);
  });

  it("matches as a substring rather than requiring a whole word", () => {
    expect(matchesSearchQuery(["dob"], ["Adobe"])).toBe(true);
  });

  it("matches the product-spec example against fields hitting only the last term", () => {
    const query = parseSearchQuery("adobe|content|a");
    // "Canva" contains none of "adobe"/"content" but does contain the
    // letter "a" - which is enough to match under OR-only semantics.
    expect(matchesSearchQuery(query, ["Canva"])).toBe(true);
    expect(matchesSearchQuery(query, ["Figma"])).toBe(true);
    // "Intercom" contains none of "adobe", "content" or "a".
    expect(matchesSearchQuery(query, ["Intercom"])).toBe(false);
  });
});

describe("makeSearchMatcher", () => {
  it("agrees with parsing then matching separately, for a normal query", () => {
    const input = "adobe|content";
    const fields = ["Adobe Express"];
    expect(makeSearchMatcher(input)(fields)).toBe(matchesSearchQuery(parseSearchQuery(input), fields));
  });

  it("agrees with parsing then matching separately, for half-typed edge cases", () => {
    const halfTyped = ["", " ", "adobe|", "adobe,", "adobe |", "|", ",", '"adobe', "-"];
    const fields = ["Adobe Express", null, "content tooling"];

    for (const input of halfTyped) {
      expect(makeSearchMatcher(input)(fields)).toBe(matchesSearchQuery(parseSearchQuery(input), fields));
    }
  });

  it("matches everything for a blank search", () => {
    expect(makeSearchMatcher("")(["anything"])).toBe(true);
    expect(makeSearchMatcher("   ")([])).toBe(true);
  });

  it("widens results as more OR terms are typed", () => {
    const narrow = makeSearchMatcher("adobe");
    const wide = makeSearchMatcher("adobe|notion");

    expect(narrow(["Notion"])).toBe(false);
    expect(wide(["Notion"])).toBe(true);
  });
});
