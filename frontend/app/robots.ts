import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Private pages, or pages useless to a searcher. They also carry a noindex
// robots meta. Robots rules are prefix matches, so single-segment pages end in
// `$`: a bare "/new" would also block a creator profile such as /newton.
const DISALLOW = [
  "/api/",
  "/admin$",
  "/admin/",
  "/auth/",
  "/login$",
  "/settings$",
  "/notifications$",
  "/new$",
  "/simple$",
  "/home/feed",
  "/*/edit$",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: DISALLOW }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
