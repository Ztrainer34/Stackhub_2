import type { Metadata } from "next";

// Shared by app/not-found.tsx and any generateMetadata that fails to load its
// record, so every 404 has the same tab title and stays out of search engines.
export const NOT_FOUND_METADATA: Metadata = {
  title: "Page not found | StackHub",
  description: "The page you're looking for has moved or no longer exists.",
  robots: { index: false, follow: true },
};
