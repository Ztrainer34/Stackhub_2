import type { Metadata } from "next";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { listPublishedPosts, getPostToolFacets } from "@/lib/post";
import {
  fromSearchParams,
  listingCanonical,
  parsePlaybooksParams,
} from "@/lib/browse-params";
import PlaybooksBrowser from "./playbooks-browser";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Same limits as useBrowsePosts / usePostToolFacets(30) in the browser: the
// query keys must match exactly or the prefetch is thrown away.
const PAGE_LIMIT = 20;
const FACET_LIMIT = 30;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = parsePlaybooksParams(fromSearchParams(await searchParams));
  const isFiltered =
    params.type !== "all" || !!params.q || !!params.tool || params.sort !== "updated";
  const url = listingCanonical("/playbooks", { page: params.page, isFiltered });
  const title = "GTM playbooks and tool comparisons";
  const description =
    "Step-by-step GTM playbooks and side-by-side tool comparisons written by operators who use the tools every day.";
  return {
    title: params.page > 1 ? `${title} (page ${params.page})` : title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url },
  };
}

/**
 * Server-renders the first view so crawlers get real cards and links, then
 * hands over to the client browser for filters, search and paging.
 */
export default async function PlaybooksPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = parsePlaybooksParams(fromSearchParams(await searchParams));

  const queryClient = new QueryClient();
  // prefetchQuery never throws: on a backend error the client simply fetches.
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: [
        "browse-posts",
        params.type,
        params.q,
        params.sort,
        params.tool,
        params.page,
        PAGE_LIMIT,
      ],
      queryFn: () => listPublishedPosts({ ...params, limit: PAGE_LIMIT }),
    }),
    queryClient.prefetchQuery({
      queryKey: ["post-tool-facets", FACET_LIMIT],
      queryFn: () => getPostToolFacets(FACET_LIMIT),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PlaybooksBrowser />
    </HydrationBoundary>
  );
}
