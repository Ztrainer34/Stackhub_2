import Link from "next/link";
import { Flame } from "lucide-react";

import PostCard from "@/components/post-card";
import { HOME_ROUTES } from "@/lib/home/config";
import type { HomePost } from "@/lib/home/types";
import { SectionHeader } from "./section-header";

/**
 * "Trending playbooks": 6 cards, 3 / 2 / 1 columns, all the same height.
 * Reuses the dashboard PostCard as is (badge, tool logos + N, 2-line title and
 * description, author and date). No "for you" label: a visitor has no stack.
 */
export function TrendingSection({ posts }: { posts: HomePost[] }) {
  if (posts.length === 0) return null;
  return (
    <section aria-labelledby="home-trending" className="px-4 py-6 sm:py-8">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          id="home-trending"
          icon={Flame}
          title="Trending playbooks"
          action={{ href: HOME_ROUTES.playbooks, label: "Browse playbooks" }}
        />
        {/* auto-rows-fr: every tile as tall as the tallest, as on the dashboard. */}
        <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={HOME_ROUTES.post(post.author_username, post.slug)}
              className="block h-full"
            >
              <PostCard post={post} className="h-full flex flex-col" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
