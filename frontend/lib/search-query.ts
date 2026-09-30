/**
 * Multi-search for the client-side tool filters.
 *
 * One idea only: you can look for several things at once, and anything matching
 * ANY of them is shown. Typing more terms always widens the result set, never
 * narrows it.
 *
 *   adobe|content|a     anything matching adobe, or content, or a
 *   adobe content       the same — a space is just another separator
 *   adobe, content      the same again
 *
 * A single word behaves exactly as it always did, so nobody has to learn this
 * to keep working.
 *
 * There is deliberately no AND, no negation and no phrase matching. An earlier
 * version had all three; it turned a search box into a query language, and the
 * thing people actually wanted was to check several tools in one go.
 *
 * Parsing is forgiving, because this runs on every keystroke against a
 * half-typed query: stray separators, quotes and a leading minus left over from
 * the old syntax are all dropped rather than matched literally, since matching
 * them literally would silently return nothing.
 */

/** The terms to look for, lowercased. Empty means "match everything". */
export type SearchQuery = string[];

/** `|`, `,` and any whitespace all separate terms; they mean the same thing. */
const SEPARATORS = /[|,\s]+/;

/**
 * Characters that carried meaning in the old operator syntax and carry none
 * now. Quotes are dropped wherever they appear; `-` and `!` only at the start
 * of a term, since a hyphen inside a word is part of names like "t-mobile".
 */
const stripLeftovers = (token: string): string =>
  token.replace(/"/g, "").replace(/^[-!]+/, "");

export function parseSearchQuery(input: string): SearchQuery {
  const terms: string[] = [];

  for (const raw of input.split(SEPARATORS)) {
    const term = stripLeftovers(raw).toLowerCase();
    // Duplicates would only make the same comparison twice.
    if (term !== "" && !terms.includes(term)) {
      terms.push(term);
    }
  }

  return terms;
}

/**
 * True when `fields` matches the query — that is, when it contains at least one
 * of the terms.
 *
 * Terms are checked against the fields joined together, so a tool named "Adobe"
 * described as "content tooling" matches either word.
 */
export function matchesSearchQuery(
  query: SearchQuery,
  fields: (string | null | undefined)[]
): boolean {
  if (query.length === 0) return true;

  const haystack = fields
    .filter((f): f is string => typeof f === "string")
    .join(" ")
    .toLowerCase();

  return query.some((term) => haystack.includes(term));
}

/** Parse and match in one step, for callers filtering a list. */
export function makeSearchMatcher(
  input: string
): (fields: (string | null | undefined)[]) => boolean {
  const query = parseSearchQuery(input);
  return (fields) => matchesSearchQuery(query, fields);
}
