import type { MetadataRoute } from "next";
import { listPublishedPosts } from "@/lib/post";
import { listTools, toolHref } from "@/lib/tool";
import { SITE_URL } from "@/lib/site";

// Rebuilt at most hourly; the public endpoints it reads are cached anyway.
export const revalidate = 3600;

// The backend caps a page at 100.
const PAGE_SIZE = 100;
// A guard, not a limit we expect to hit: 50 pages = 5,000 items per kind.
const MAX_PAGES = 50;

/** Fetch every page of a paginated public endpoint. */
async function fetchAll<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; totalPages: number }>
): Promise<T[]> {
  const first = await fetchPage(1);
  const pages = Math.min(first.totalPages, MAX_PAGES);
  const rest = await Promise.all(
    Array.from({ length: Math.max(pages - 1, 0) }, (_, i) => fetchPage(i + 2))
  );
  return [first, ...rest].flatMap((p) => p.items);
}

const abs = (path: string) => `${SITE_URL}${path}`;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    { url: abs("/"), changeFrequency: "daily", priority: 1 },
    { url: abs("/playbooks"), changeFrequency: "daily", priority: 0.9 },
    { url: abs("/tools"), changeFrequency: "daily", priority: 0.9 },
    { url: abs("/about"), changeFrequency: "monthly", priority: 0.5 },
  ];

  // Each source degrades on its own: a backend hiccup should shrink the
  // sitemap for an hour, not turn /sitemap.xml into a 500.
  const [postsResult, toolsResult] = await Promise.allSettled([
    fetchAll((page) =>
      listPublishedPosts({ sort: "updated", page, limit: PAGE_SIZE }).then((r) => ({
        items: r.posts,
        totalPages: r.total_pages,
      }))
    ),
    // GET /tools already excludes hidden tools.
    fetchAll((page) =>
      listTools({ sort: "name", page, limit: PAGE_SIZE }).then((r) => ({
        items: r.tools,
        totalPages: r.total_pages,
      }))
    ),
  ]);

  if (postsResult.status === "rejected") {
    console.error("sitemap: posts unavailable:", postsResult.reason);
  }
  if (toolsResult.status === "rejected") {
    console.error("sitemap: tools unavailable:", toolsResult.reason);
  }

  const posts = postsResult.status === "fulfilled" ? postsResult.value : [];
  const tools = toolsResult.status === "fulfilled" ? toolsResult.value : [];

  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: abs(`/${post.author_username}/${post.slug}`),
    lastModified: post.last_publish || post.updated_at,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Creators with at least one published post; their profile's last change is
  // their latest post.
  const creators = new Map<string, string>();
  for (const post of posts) {
    const seen = creators.get(post.author_username);
    const updated = post.last_publish || post.updated_at;
    if (!seen || updated > seen) creators.set(post.author_username, updated);
  }
  const creatorEntries: MetadataRoute.Sitemap = [...creators].map(
    ([username, lastModified]) => ({
      url: abs(`/${username}`),
      lastModified,
      changeFrequency: "weekly",
      priority: 0.6,
    })
  );

  const toolEntries: MetadataRoute.Sitemap = tools.map((tool) => ({
    url: abs(toolHref(tool)),
    lastModified: tool.updated_at,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticPages, ...postEntries, ...creatorEntries, ...toolEntries];
}
