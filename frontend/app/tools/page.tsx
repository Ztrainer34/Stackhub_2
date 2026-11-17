import type { Metadata } from "next";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { listTools } from "@/lib/tool";
import { getTopCategories } from "@/lib/homepage";
import {
  fromSearchParams,
  listingCanonical,
  parseToolsParams,
} from "@/lib/browse-params";
import ToolsBrowser from "./tools-browser";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

// Same limits as useBrowseTools / useToolCategories(100) in the browser: the
// query keys must match exactly or the prefetch is thrown away.
const PAGE_LIMIT = 24;
const CATEGORY_LIMIT = 100;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const params = parseToolsParams(fromSearchParams(await searchParams));
  const isFiltered = params.category !== "all" || !!params.q || params.sort !== "name";
  const url = listingCanonical("/tools", { page: params.page, isFiltered });
  const title = "GTM tools directory";
  const description =
    "Browse GTM and marketing tools by category, and see which operators use each one and the playbooks they wrote about it.";
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
export default async function ToolsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = parseToolsParams(fromSearchParams(await searchParams));

  const queryClient = new QueryClient();
  // prefetchQuery never throws: on a backend error the client simply fetches.
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: [
        "browse-tools",
        params.q,
        params.category,
        params.sort,
        params.page,
        PAGE_LIMIT,
      ],
      queryFn: () => listTools({ ...params, limit: PAGE_LIMIT }),
    }),
    queryClient.prefetchQuery({
      queryKey: ["tool-categories", CATEGORY_LIMIT],
      queryFn: () => getTopCategories(CATEGORY_LIMIT),
    }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ToolsBrowser />
    </HydrationBoundary>
  );
}
