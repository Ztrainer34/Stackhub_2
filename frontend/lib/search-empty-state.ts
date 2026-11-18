/**
 * Whether a search that found nothing should offer to add the missing thing.
 *
 * Only the tool catalogue can be extended by a visitor. A search for a post or
 * a person that comes back empty has nothing to offer — suggesting someone
 * "add" a user would be nonsense — so the prompt is scoped to the tools tab.
 *
 * Kept out of the component because it is the whole rule: the moment it reads
 * `category === "tool"` inline in JSX it stops being checkable without
 * rendering the page.
 */
export function shouldOfferToolSuggestion(
  activeCategory: string | null | undefined,
  resultCount: number
): boolean {
  if (activeCategory !== "tool") return false;

  // A negative count is nonsense, but treating it as "no results" is kinder
  // than rendering a prompt beside a list that does have rows in it.
  return resultCount <= 0;
}

/**
 * Whether a search that found nothing should offer to write the missing post.
 *
 * Anyone can publish a playbook or comparison, so an empty search on the
 * posts tab is the moment to invite one. Tools and people have their own
 * rules (see shouldOfferToolSuggestion); a person can't be "created" here.
 */
export function shouldOfferPostCreation(
  activeCategory: string | null | undefined,
  resultCount: number
): boolean {
  if (activeCategory !== "post") return false;

  // Same tolerance as shouldOfferToolSuggestion: a negative count means
  // "no results", never a prompt rendered beside a list with rows in it.
  return resultCount <= 0;
}
