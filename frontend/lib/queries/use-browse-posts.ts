import { useQuery } from "@tanstack/react-query";
import { listPublishedPosts } from "../post";

export function useBrowsePosts(params: {
  type: string;
  q: string;
  sort: string;
  page: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: [
      "browse-posts",
      params.type,
      params.q,
      params.sort,
      params.page,
      params.limit ?? 20,
    ],
    queryFn: () => listPublishedPosts(params),
    staleTime: 30_000,
  });
}
