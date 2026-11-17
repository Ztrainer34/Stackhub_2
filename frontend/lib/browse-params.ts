/**
 * URL → query params for the /playbooks and /tools listings.
 *
 * Shared by the server page (which prefetches the first render) and the
 * client browser (which reads the same URL), so both build the same React
 * Query key and the prefetched data is actually used on hydration.
 */

type Get = (key: string) => string | null | undefined;

function parsePage(raw: string | null | undefined): number {
  const page = parseInt(raw || "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export function parsePlaybooksParams(get: Get) {
  return {
    type: get("type") || "all",
    q: get("q") || "",
    sort: get("sort") || "updated",
    tool: get("tool") || "",
    page: parsePage(get("page")),
  };
}

export function parseToolsParams(get: Get) {
  return {
    q: get("q") || "",
    category: get("category") || "all",
    sort: get("sort") || "name",
    page: parsePage(get("page")),
  };
}

/** Adapts Next's `searchParams` object to the `get` the parsers take. */
export function fromSearchParams(
  params: Record<string, string | string[] | undefined>
): Get {
  return (key) => {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
  };
}

/** `?page=N` on top of the current query; page 1 drops the param. */
export function pageHref(
  pathname: string,
  current: URLSearchParams,
  page: number
): string {
  const params = new URLSearchParams(current.toString());
  if (page <= 1) params.delete("page");
  else params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Canonical for a listing: the bare page for page 1, `?page=N` for later pages
 * (each lists different items, so each is its own page to a search engine).
 * Any filter, sort or search collapses onto the unfiltered listing.
 */
export function listingCanonical(
  pathname: string,
  params: { page: number; isFiltered: boolean }
): string {
  if (params.isFiltered || params.page <= 1) return pathname;
  return `${pathname}?page=${params.page}`;
}
