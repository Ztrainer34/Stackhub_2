/**
 * A small search language for the client-side filters.
 *
 * Plain text still behaves the way it always did — `adobe` matches anything
 * containing "adobe" — so nobody has to learn this to keep working. The
 * operators are there when a plain substring is not enough:
 *
 *   adobe content      both words, anywhere      (AND — the default)
 *   adobe|content      either word               (OR; `or` also works)
 *   adobe -cloud       "adobe" but not "cloud"   (NOT; `!` also works)
 *   "adobe cloud"      that exact phrase
 *
 * OR binds loosest, so `a b | c` reads as `(a AND b) OR c`.
 *
 * Parsing is deliberately forgiving. This runs on every keystroke against a
 * half-typed query, so a trailing `|`, a lone `-` or an unclosed quote has to
 * mean something sensible rather than throwing or silently matching nothing.
 */

/** One term. `negated` means the field must NOT contain it. */
export interface SearchTerm {
  text: string;
  negated: boolean;
}

/**
 * OR of ANDs: the outer array is alternatives, the inner one is terms that must
 * all hold. An empty outer array matches everything — that is how a blank or
 * operator-only query behaves.
 */
export type SearchQuery = SearchTerm[][];

/** Splits on whitespace, keeping "quoted phrases" whole. */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const pattern = /"([^"]*)"|(\S+)/g;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(input)) !== null) {
    // An unclosed quote never matches group 1, so its text falls through to
    // group 2 and is treated as ordinary words. Half-typed input still filters.
    tokens.push(match[1] !== undefined ? match[1] : match[2]);
  }

  return tokens;
}

export function parseSearchQuery(input: string): SearchQuery {
  const groups: SearchTerm[][] = [];
  let current: SearchTerm[] = [];

  const endGroup = () => {
    if (current.length > 0) groups.push(current);
    current = [];
  };

  for (const raw of tokenize(input)) {
    // `|` is also accepted glued to words, so "adobe|content" splits here
    // rather than being read as one odd term.
    const pieces = raw.split("|");

    pieces.forEach((piece, index) => {
      if (index > 0) endGroup();

      const token = piece.trim();
      if (token === "") return;

      // Bare operators from a half-typed query carry no meaning on their own.
      const lower = token.toLowerCase();
      if (lower === "or") {
        endGroup();
        return;
      }
      if (lower === "and" || token === "-" || token === "!") return;

      const negated = token.startsWith("-") || token.startsWith("!");
      const text = (negated ? token.slice(1) : token).toLowerCase();
      if (text === "") return;

      current.push({ text, negated });
    });
  }

  endGroup();
  return groups;
}

/**
 * True when `fields` satisfies the query. A tool matches if ANY group matches,
 * and a group matches when every one of its terms does.
 *
 * A term is checked against the fields joined together, so `adobe content`
 * matches a tool named "Adobe" described as "content tooling" — the words do
 * not have to share a field.
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

  return query.some((group) =>
    group.every(({ text, negated }) =>
      negated ? !haystack.includes(text) : haystack.includes(text)
    )
  );
}

/** Parse and match in one step, for callers filtering a list. */
export function makeSearchMatcher(
  input: string
): (fields: (string | null | undefined)[]) => boolean {
  const query = parseSearchQuery(input);
  return (fields) => matchesSearchQuery(query, fields);
}
