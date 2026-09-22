import { describe, it, expect } from "vitest";
import { parseSearchQuery, matchesSearchQuery, makeSearchMatcher } from "@/lib/search-query";

/**
 * Small search language for the client-side tool filters. It runs on every
 * keystroke against a half-typed query, so a trailing "|", a lone "-", or an
 * unclosed quote must all parse into *something* sensible - never throw, and
 * never silently produce a query that matches nothing. OR (`|` / `or`) binds
 * loosest, so `a b | c` reads as `(a AND b) OR c`.
 */

describe("parseSearchQuery", () => {
  it("parses a single word into one group with one un-negated term", () => {
    expect(parseSearchQuery("adobe")).toEqual([[{ text: "adobe", negated: false }]]);
  });

  it("lowercases term text", () => {
    expect(parseSearchQuery("Adobe")).toEqual([[{ text: "adobe", negated: false }]]);
  });

  it("treats space-separated words as one AND group", () => {
    expect(parseSearchQuery("adobe content")).toEqual([
      [
        { text: "adobe", negated: false },
        { text: "content", negated: false },
      ],
    ]);
  });

  it("splits into separate OR groups on |", () => {
    expect(parseSearchQuery("adobe|content")).toEqual([
      [{ text: "adobe", negated: false }],
      [{ text: "content", negated: false }],
    ]);
  });

  it("splits on | even when glued to a word with no surrounding spaces", () => {
    // A user rarely types spaces around the pipe.
    expect(parseSearchQuery("adobe|content")).toHaveLength(2);
  });

  it("accepts the word 'or' (any case) as equivalent to |", () => {
    expect(parseSearchQuery("adobe or content")).toEqual(parseSearchQuery("adobe|content"));
    expect(parseSearchQuery("adobe OR content")).toEqual(parseSearchQuery("adobe|content"));
  });

  it("marks a term negated when prefixed with -", () => {
    expect(parseSearchQuery("-cloud")).toEqual([[{ text: "cloud", negated: true }]]);
  });

  it("marks a term negated when prefixed with !", () => {
    expect(parseSearchQuery("!cloud")).toEqual([[{ text: "cloud", negated: true }]]);
  });

  it("keeps a quoted phrase as a single term, spaces included, and lowercases it", () => {
    expect(parseSearchQuery('"Adobe Cloud"')).toEqual([[{ text: "adobe cloud", negated: false }]]);
  });

  it("gives OR the loosest precedence: 'a b | c' is (a AND b) OR c", () => {
    expect(parseSearchQuery("a b | c")).toEqual([
      [
        { text: "a", negated: false },
        { text: "b", negated: false },
      ],
      [{ text: "c", negated: false }],
    ]);
  });

  it("returns no groups for empty input", () => {
    expect(parseSearchQuery("")).toEqual([]);
  });

  it("returns no groups for whitespace-only input", () => {
    expect(parseSearchQuery("   ")).toEqual([]);
  });

  it("returns no groups when the input is only a |", () => {
    expect(parseSearchQuery("|")).toEqual([]);
  });

  it("returns no groups when the input is only a -", () => {
    expect(parseSearchQuery("-")).toEqual([]);
  });

  it("returns no groups when the input is only a !", () => {
    expect(parseSearchQuery("!")).toEqual([]);
  });

  it("returns no groups when the input is only 'or'", () => {
    expect(parseSearchQuery("or")).toEqual([]);
  });

  it("drops a bare 'and' token without starting a new group", () => {
    // Space is already AND, so a literal "and" should be a no-op, not a
    // third kind of separator.
    expect(parseSearchQuery("adobe and content")).toEqual(parseSearchQuery("adobe content"));
  });

  it("drops a bare '-' token in the middle of a query", () => {
    expect(parseSearchQuery("adobe - content")).toEqual(parseSearchQuery("adobe content"));
  });

  it("drops a bare '!' token in the middle of a query", () => {
    expect(parseSearchQuery("adobe ! content")).toEqual(parseSearchQuery("adobe content"));
  });

  it("never emits an empty group for consecutive separators", () => {
    // "a||b" must give two groups, not three with a hole in the middle.
    expect(parseSearchQuery("a||b")).toEqual([
      [{ text: "a", negated: false }],
      [{ text: "b", negated: false }],
    ]);
  });

  it("does not throw on a trailing lone | and drops it", () => {
    // Happens on literally every keystroke right after typing a pipe.
    expect(() => parseSearchQuery("adobe|")).not.toThrow();
    expect(parseSearchQuery("adobe|")).toEqual([[{ text: "adobe", negated: false }]]);
  });

  it("does not throw on a trailing lone - and drops it", () => {
    expect(() => parseSearchQuery("adobe -")).not.toThrow();
    expect(parseSearchQuery("adobe -")).toEqual([[{ text: "adobe", negated: false }]]);
  });

  it("does not throw on an unclosed quote", () => {
    expect(() => parseSearchQuery('"adobe')).not.toThrow();
  });

  it("treats an unclosed quote as ordinary words, not a phrase still waiting to close", () => {
    // A genuinely closed two-word phrase is one term. An unclosed quote in
    // front of the same two words must not collapse to that same single
    // "adobe cloud" phrase term - it has nothing to close it into a phrase.
    const closed = parseSearchQuery('"adobe cloud"');
    const unclosed = parseSearchQuery('"adobe cloud');

    expect(closed).toEqual([[{ text: "adobe cloud", negated: false }]]);
    expect(unclosed).not.toEqual(closed);
  });
});

describe("matchesSearchQuery", () => {
  it("matches everything when the query is empty", () => {
    // A blank search box must filter nothing out.
    expect(matchesSearchQuery([], ["Adobe", "Content"])).toBe(true);
    expect(matchesSearchQuery([], [])).toBe(true);
    expect(matchesSearchQuery([], [null, undefined])).toBe(true);
  });

  it("matches terms against fields joined together, not field-by-field", () => {
    // "adobe content" should match a tool named "Adobe" described as
    // "content tooling" - neither field alone contains both words.
    const query = parseSearchQuery("adobe content");
    expect(matchesSearchQuery(query, ["Adobe", "content tooling"])).toBe(true);
  });

  it("ignores null and undefined entries in fields", () => {
    const query = parseSearchQuery("adobe");
    expect(matchesSearchQuery(query, [null, "Adobe", undefined])).toBe(true);
  });

  it("requires every term in a group to match (AND)", () => {
    const query = parseSearchQuery("adobe content");
    expect(matchesSearchQuery(query, ["Adobe Express"])).toBe(false);
  });

  it("matches when any group matches (OR)", () => {
    const query = parseSearchQuery("adobe|content");
    expect(matchesSearchQuery(query, ["content tooling"])).toBe(true);
    expect(matchesSearchQuery(query, ["Adobe Express"])).toBe(true);
    expect(matchesSearchQuery(query, ["Notion"])).toBe(false);
  });

  it("excludes fields containing a negated term", () => {
    const query = parseSearchQuery("adobe -cloud");
    expect(matchesSearchQuery(query, ["Adobe Express"])).toBe(true);
    expect(matchesSearchQuery(query, ["Adobe Cloud"])).toBe(false);
  });

  it("matches a group of only negations against anything lacking that text", () => {
    const query = parseSearchQuery("-adobe");
    expect(matchesSearchQuery(query, ["Notion"])).toBe(true);
    expect(matchesSearchQuery(query, ["Adobe Express"])).toBe(false);
  });

  it("is case-insensitive regardless of which side has the different case", () => {
    expect(matchesSearchQuery(parseSearchQuery("ADOBE"), ["adobe express"])).toBe(true);
    expect(matchesSearchQuery(parseSearchQuery("adobe"), ["ADOBE EXPRESS"])).toBe(true);
  });

  it("matches a quoted phrase only when its words are adjacent in order", () => {
    const query = parseSearchQuery('"adobe cloud"');
    expect(matchesSearchQuery(query, ["Adobe Cloud Suite"])).toBe(true);
    // Both words are present but not adjacent as "adobe cloud" - the phrase
    // must not silently degrade into an AND of its words.
    expect(matchesSearchQuery(query, ["cloud storage", "Adobe suite"])).toBe(false);
  });
});

describe("makeSearchMatcher", () => {
  it("agrees with parsing then matching separately, for a normal query", () => {
    const input = "adobe -cloud|content";
    const fields = ["Adobe Express"];
    expect(makeSearchMatcher(input)(fields)).toBe(matchesSearchQuery(parseSearchQuery(input), fields));
  });

  it("agrees with parsing then matching separately, for half-typed edge cases", () => {
    // These are exactly the strings a text box holds mid-keystroke.
    const halfTyped = ["", " ", "adobe|", "adobe -", '"adobe', "|", "-", "!", "or"];
    const fields = ["Adobe Express", null, "content tooling"];

    for (const input of halfTyped) {
      expect(makeSearchMatcher(input)(fields)).toBe(matchesSearchQuery(parseSearchQuery(input), fields));
    }
  });

  it("matches everything for a blank search", () => {
    expect(makeSearchMatcher("")(["anything"])).toBe(true);
    expect(makeSearchMatcher("   ")([])).toBe(true);
  });

  it("filters using AND and NOT together", () => {
    const matcher = makeSearchMatcher("adobe -cloud");
    expect(matcher(["Adobe Express"])).toBe(true);
    expect(matcher(["Adobe Cloud"])).toBe(false);
    expect(matcher(["Notion"])).toBe(false);
  });
});
