import { useQuery } from "@tanstack/react-query";
import { listPublishedPosts, getPostToolFacets } from "../post";

export function useBrowsePosts(params: {
  type: string;
  q: string;
  sort: string;
  tool: string;
  page: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: [
      "browse-posts",
      params.type,
      params.q,
      params.sort,
      params.tool,
      params.page,
      params.limit ?? 20,
    ],
    queryFn: () => listPublishedPosts(params),
    staleTime: 30_000,
  });
}

export function usePostToolFacets(limit: number = 20) {
  return useQuery({
    queryKey: ["post-tool-facets", limit],
    queryFn: () => getPostToolFacets(limit),
    staleTime: 5 * 60_000,
  });
}
